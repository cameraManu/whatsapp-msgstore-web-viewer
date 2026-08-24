import Database from 'better-sqlite3';

export interface Conversation {
  _id: number;
  jid: string;
  subject: string | null;
  timestamp: number;
}

export interface Message {
  _id: number;
  from_me: boolean;
  text_data: string | null;
  timestamp: number; // ms epoch; converted to Date on the client
  quoted_text: string | null;
  has_media: boolean;
  media_path: string | null; // relative path under WA_MEDIA_DIR, if any
  media_mime: string | null;
  media_caption: string | null;
}

let db: Database.Database | null = null;
let mediaJoinAvailable = false;
let mediaColumns: { pathCol: string; mimeCol: string | null; captionCol: string | null; linkCol: string } | null = null;

// Contact name resolution (from wa.db) — a simple in-memory map keyed by
// phone number (the "user" part of a JID, e.g. "40712345678"), since
// wa_contacts is a small table and this avoids a query per conversation row.
let contactsByPhone: Map<string, string> = new Map();

/** Opens the decrypted SQLite database bytes read-only, in memory. */
export const openDatabase = (buffer: Buffer): void => {
  if (db) db.close();
  db = new Database(buffer, { readonly: true });
  detectMediaSchema();
};

export const isDatabaseOpen = (): boolean => db !== null;

/**
 * Opens the decrypted wa.db contacts database and loads display names into
 * memory. Safe to call with no contacts DB available — resolveContactName
 * just falls back to the raw phone number in that case.
 */
export const loadContacts = (buffer: Buffer): number => {
  contactsByPhone = new Map();
  let contactsDb: Database.Database | null = null;
  try {
    contactsDb = new Database(buffer, { readonly: true });

    const allTables = contactsDb
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as { name: string }[];
    console.log(`[contacts] Tables in wa.db: ${allTables.map((t) => t.name).join(', ')}`);

    const tables = allTables.filter((t) => t.name === 'wa_contacts');
    if (tables.length === 0) {
      console.log('[contacts] No "wa_contacts" table found.');
      return 0;
    }

    const cols = contactsDb.prepare(`PRAGMA table_info(wa_contacts)`).all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    console.log(`[contacts] wa_contacts columns: ${colNames.join(', ')}`);

    const nameCol = ['display_name', 'given_name', 'wa_name', 'name'].find((c) => colNames.includes(c));
    const jidCol = ['jid', 'raw_contact_id', 'number'].find((c) => colNames.includes(c));

    if (!nameCol || !jidCol) {
      console.log(
        `[contacts] Could not find expected columns (name: ${nameCol || 'none'}, jid: ${jidCol || 'none'}) — check the column list above.`
      );
      return 0;
    }

    const rows = contactsDb.prepare(`SELECT ${jidCol} AS jid, ${nameCol} AS name FROM wa_contacts`).all() as {
      jid: string;
      name: string | null;
    }[];
    console.log(`[contacts] Read ${rows.length} row(s) from wa_contacts. Sample: ${JSON.stringify(rows.slice(0, 3))}`);

    for (const row of rows) {
      if (!row.name || !row.jid) continue;
      // JIDs look like "40712345678@s.whatsapp.net" — extract just the number.
      const phone = row.jid.split('@')[0];
      if (phone) contactsByPhone.set(phone, row.name);
    }

    return contactsByPhone.size;
  } catch (err: any) {
    console.log(`[contacts] Error reading wa_contacts: ${err.message}`);
    contactsByPhone = new Map();
    return 0;
  } finally {
    contactsDb?.close();
  }
};

const resolveContactName = (phone: string): string | null => contactsByPhone.get(phone) || null;

/**
 * WhatsApp's message_media schema has varied slightly across versions.
 * Detect the actual column names at runtime instead of hardcoding one
 * version, so this keeps working across schema variants.
 */
function detectMediaSchema(): void {
  mediaJoinAvailable = false;
  mediaColumns = null;
  if (!db) return;

  try {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='message_media'`)
      .all() as { name: string }[];
    if (tables.length === 0) return;

    const cols = db.prepare(`PRAGMA table_info(message_media)`).all() as { name: string }[];
    const colNames = cols.map((c) => c.name);

    // Column that links message_media back to message._id
    const linkCol = ['message_row_id', 'message_id', '_id'].find((c) => colNames.includes(c));
    // Relative file path column
    const pathCol = ['file_path', 'media_url', 'path'].find((c) => colNames.includes(c));
    if (!linkCol || !pathCol) return;

    const mimeCol = ['mime_type', 'media_mime_type'].find((c) => colNames.includes(c)) || null;
    const captionCol = ['media_caption', 'caption'].find((c) => colNames.includes(c)) || null;

    mediaColumns = { pathCol, mimeCol, captionCol, linkCol };
    mediaJoinAvailable = true;
  } catch {
    mediaJoinAvailable = false;
  }
}

export const getConversations = (limit: number = 1000): Conversation[] => {
  if (!db) throw new Error('Database not loaded');

  const rows = db
    .prepare(
      `
      SELECT
        chat._id,
        jid.user,
        chat.subject,
        chat.sort_timestamp
      FROM chat
      LEFT JOIN jid ON chat.jid_row_id = jid._id
      ORDER BY chat.sort_timestamp DESC
      LIMIT ?
    `
    )
    .all(limit) as any[];

  return rows.map((row) => {
    const phone = row.user || 'Unknown';
    // For group chats, chat.subject is already the group name — leave as-is.
    // For 1:1 chats, prefer the resolved contact name over the raw number.
    const resolvedSubject = row.subject || (phone !== 'Unknown' ? resolveContactName(phone) : null);
    return {
      _id: row._id,
      jid: phone,
      subject: resolvedSubject,
      timestamp: row.sort_timestamp,
    };
  });
};

/** Looks up the relative media file path for a single message, used by the /api/media endpoint. */
export const getMediaPathForMessage = (messageId: number): string | null => {
  if (!db || !mediaJoinAvailable || !mediaColumns) return null;
  try {
    const row = db
      .prepare(
        `SELECT ${mediaColumns.pathCol} AS media_path FROM message_media WHERE ${mediaColumns.linkCol} = ? LIMIT 1`
      )
      .get(messageId) as { media_path: string } | undefined;
    return row?.media_path || null;
  } catch {
    return null;
  }
};

export const getMessages = (chatRowId: number, limit: number = 5000): Message[] => {
  if (!db) throw new Error('Database not loaded');

  const mediaSelect =
    mediaJoinAvailable && mediaColumns
      ? `mm.${mediaColumns.pathCol} AS media_path,
         ${mediaColumns.mimeCol ? `mm.${mediaColumns.mimeCol}` : 'NULL'} AS media_mime,
         ${mediaColumns.captionCol ? `mm.${mediaColumns.captionCol}` : 'NULL'} AS media_caption,`
      : 'NULL AS media_path, NULL AS media_mime, NULL AS media_caption,';

  const mediaJoin =
    mediaJoinAvailable && mediaColumns
      ? `LEFT JOIN message_media mm ON mm.${mediaColumns.linkCol} = message._id`
      : '';

  const rows = db
    .prepare(
      `
      SELECT
        message._id,
        message.from_me,
        message.text_data,
        message.timestamp,
        (SELECT text_data FROM message_quoted WHERE message_quoted.message_row_id = message._id) AS quoted_text,
        ${mediaSelect}
        1 AS _dummy
      FROM message
      ${mediaJoin}
      WHERE message.chat_row_id = ?
      ORDER BY message.sort_id DESC
      LIMIT ?
    `
    )
    .all(chatRowId, limit) as any[];

  return rows
    .map((row) => ({
      _id: row._id,
      from_me: row.from_me === 1,
      text_data: row.text_data,
      timestamp: row.timestamp,
      quoted_text: row.quoted_text,
      has_media: row.text_data === null,
      media_path: row.media_path || null,
      media_mime: row.media_mime || null,
      media_caption: row.media_caption || null,
    }))
    .reverse();
};
