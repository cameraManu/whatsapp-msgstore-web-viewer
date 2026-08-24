import Database from 'better-sqlite3';

export interface Conversation {
  _id: number;
  jid: string;
  subject: string | null;
  timestamp: number;
  lastMessagePreview: string | null;
  unreadCount: number;
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

/** Opens the decrypted SQLite database bytes read-only, in memory. */
export const openDatabase = (buffer: Buffer): void => {
  if (db) db.close();
  db = new Database(buffer, { readonly: true });
  detectMediaSchema();
};

export const isDatabaseOpen = (): boolean => db !== null;

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

/** Total number of conversations, used by the client to know when to stop paging. */
export const getConversationsCount = (): number => {
  if (!db) throw new Error('Database not loaded');
  const row = db.prepare(`SELECT COUNT(*) AS count FROM chat`).get() as { count: number };
  return row.count;
};

/**
 * Paginated conversation list, sorted by most recent activity first (matches
 * WhatsApp Web's chat list ordering). Includes a short preview of the last
 * message so the list can render like a real chat list without a second
 * round-trip per row.
 */
export const getConversations = (limit: number = 30, offset: number = 0): Conversation[] => {
  if (!db) throw new Error('Database not loaded');

  const rows = db
    .prepare(
      `
      SELECT
        chat._id,
        jid.user,
        chat.subject,
        chat.sort_timestamp,
        (
          SELECT text_data FROM message
          WHERE message.chat_row_id = chat._id
          ORDER BY message.sort_id DESC
          LIMIT 1
        ) AS last_text,
        (
          SELECT from_me FROM message
          WHERE message.chat_row_id = chat._id
          ORDER BY message.sort_id DESC
          LIMIT 1
        ) AS last_from_me
      FROM chat
      LEFT JOIN jid ON chat.jid_row_id = jid._id
      ORDER BY chat.sort_timestamp DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(limit, offset) as any[];

  return rows.map((row) => {
    const preview = row.last_text
      ? (row.last_from_me === 1 ? 'You: ' : '') + row.last_text
      : row.last_text === null && row.last_from_me !== null
        ? '📷 Media'
        : null;
    return {
      _id: row._id,
      jid: row.user || 'Unknown',
      subject: row.subject,
      timestamp: row.sort_timestamp,
      lastMessagePreview: preview,
      unreadCount: 0, // not tracked in this read-only viewer
    };
  });
};

/**
 * Client-side-style search across ALL conversations (not just the loaded
 * page) — matches by group subject or phone number substring. Kept fast by
 * only selecting the columns needed and relying on SQLite's index-free scan
 * over what's typically a small `chat` table (hundreds to low thousands of rows).
 */
export const searchConversations = (query: string, limit: number = 50): Conversation[] => {
  if (!db) throw new Error('Database not loaded');
  const like = `%${query}%`;

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
      WHERE chat.subject LIKE ? OR jid.user LIKE ?
      ORDER BY chat.sort_timestamp DESC
      LIMIT ?
    `
    )
    .all(like, like, limit) as any[];

  return rows.map((row) => ({
    _id: row._id,
    jid: row.user || 'Unknown',
    subject: row.subject,
    timestamp: row.sort_timestamp,
    lastMessagePreview: null,
    unreadCount: 0,
  }));
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
