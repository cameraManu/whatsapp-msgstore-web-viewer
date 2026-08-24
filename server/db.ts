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
}

let db: Database.Database | null = null;

/** Opens the decrypted SQLite database bytes read-only, in memory. */
export const openDatabase = (buffer: Buffer): void => {
  if (db) db.close();
  db = new Database(buffer, { readonly: true });
};

export const isDatabaseOpen = (): boolean => db !== null;

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

  return rows.map((row) => ({
    _id: row._id,
    jid: row.user || 'Unknown',
    subject: row.subject,
    timestamp: row.sort_timestamp,
  }));
};

export const getMessages = (chatRowId: number, limit: number = 5000): Message[] => {
  if (!db) throw new Error('Database not loaded');

  const rows = db
    .prepare(
      `
      SELECT
        message._id,
        message.from_me,
        message.text_data,
        message.timestamp,
        (SELECT text_data FROM message_quoted WHERE message_quoted.message_row_id = message._id) AS quoted_text
      FROM message
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
    }))
    .reverse();
};
