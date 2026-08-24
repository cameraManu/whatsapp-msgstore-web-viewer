export interface Conversation {
  _id: number;
  jid: string;
  subject: string | null;
  timestamp: number;
  messageCount?: number;
  lastMessagePreview: string | null;
  unreadCount: number;
}

export interface Message {
  _id: number;
  from_me: boolean;
  text_data: string | null;
  timestamp: Date;
  quoted_text: string | null;
  has_media: boolean;
  media_type?: string;
  media_path: string | null;
  media_mime: string | null;
  media_caption: string | null;
}

export interface DbStats {
  chatCount: number;
  messageCount: number;
}
