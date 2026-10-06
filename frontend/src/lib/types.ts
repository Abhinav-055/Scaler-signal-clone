// Mirrors the backend Pydantic schemas (backend/app/schemas).

export interface User {
  id: number;
  phone: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  about: string;
  avatar_color: string;
  last_seen_at: string;
  online: boolean;
}

export interface Contact {
  user: User;
  nickname: string | null;
  created_at: string;
}

export type ResourceType = "image" | "video" | "raw";

export interface AttachmentInput {
  public_id: string;
  secure_url: string;
  resource_type: ResourceType;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

export interface Attachment extends AttachmentInput {
  id: number;
}

export interface ReplyPreview {
  id: number;
  sender_id: number | null;
  type: MessageType;
  body: string;
  has_attachment: boolean;
}

export interface Reaction {
  user_id: number;
  emoji: string;
}

export type MessageType = "text" | "image" | "file" | "system";
export type ServerStatus = "sent" | "delivered" | "read";
/** "sending" and "failed" only ever exist on the client (optimistic messages). */
export type MessageStatus = "sending" | "failed" | ServerStatus;

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  client_id: string;
  type: MessageType;
  body: string;
  reply_to_id: number | null;
  reply_to: ReplyPreview | null;
  created_at: string;
  edited_at: string | null;
  expires_at: string | null;
  attachments: Attachment[];
  reactions: Reaction[];
  status: ServerStatus | null;
}

/** A file being uploaded for an optimistic message. */
export interface LocalUpload {
  name: string;
  size: number;
  mimeType: string;
  previewUrl: string | null;
  progress: number; // 0..1
}

/** What the UI renders: a server message, or an optimistic one that has no real id yet. */
export interface ChatMessage extends Omit<Message, "status"> {
  status: MessageStatus | null;
  pending?: boolean;
  uploads?: LocalUpload[];
  error?: string;
}

export interface MessagePage {
  messages: Message[];
  has_more: boolean;
}

export interface Member {
  user: User;
  role: "admin" | "member";
  joined_at: string;
  left_at: string | null;
}

export interface Conversation {
  id: number;
  type: "direct" | "group";
  name: string | null;
  avatar_url: string | null;
  description: string | null;
  created_by: number | null;
  disappearing_seconds: number | null;
  last_message_at: string;
  created_at: string;
  members: Member[];
  unread_count: number;
  last_message: Message | null;
  last_read_message_id: number | null;
  muted_until: string | null;
  archived: boolean;
  my_role: "admin" | "member";
  is_active_member: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
  is_new_user: boolean;
}

export interface SignResponse {
  upload_url: string;
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  resource_type: "image" | "video" | "raw";
}

export interface MessageInfo {
  message_id: number;
  created_at: string;
  receipts: { user_id: number; delivered_at: string | null; read_at: string | null }[];
}

export interface SendPayload {
  client_id: string;
  conversation_id: number;
  body: string;
  reply_to_id?: number | null;
  attachments?: AttachmentInput[];
}
