// Derived display data for conversations and messages.
import type { ChatMessage, Contact, Conversation, Member, Message, ReplyPreview, User } from "@/lib/types";

export function otherMember(conv: Conversation, meId: number): Member | undefined {
  return conv.members.find((m) => m.user.id !== meId);
}

export function displayName(user: User, contacts?: Contact[]): string {
  const nickname = contacts?.find((c) => c.user.id === user.id)?.nickname;
  return nickname || user.display_name || user.phone;
}

export function conversationTitle(conv: Conversation, meId: number, contacts?: Contact[]): string {
  if (conv.type === "group") return conv.name || "Unnamed group";
  const other = otherMember(conv, meId);
  return other ? displayName(other.user, contacts) : "Unknown";
}

export interface AvatarInfo {
  name: string;
  url: string | null;
  color: string;
  group: boolean;
}

/** Groups get a stable colour from their id; direct chats use the other person's colour. */
const GROUP_COLORS = ["blue", "teal", "green", "orange", "pink", "purple", "violet", "indigo"];

export function conversationAvatar(conv: Conversation, meId: number, contacts?: Contact[]): AvatarInfo {
  if (conv.type === "group") {
    return { name: conv.name ?? "", url: conv.avatar_url, color: GROUP_COLORS[conv.id % GROUP_COLORS.length], group: true };
  }
  const other = otherMember(conv, meId)?.user;
  return {
    name: conversationTitle(conv, meId, contacts),
    url: other?.avatar_url ?? null,
    color: other?.avatar_color ?? "steel",
    group: false,
  };
}

export function memberById(conv: Conversation, userId: number | null): Member | undefined {
  return conv.members.find((m) => m.user.id === userId);
}

export function senderName(conv: Conversation, userId: number | null, meId: number, contacts?: Contact[]): string {
  if (userId === meId) return "You";
  const member = memberById(conv, userId);
  return member ? displayName(member.user, contacts) : "Unknown";
}

/** Text used for list previews and reply quotes: "Photo", "File", or the message body. */
export function messageSummary(
  msg: Pick<Message, "type" | "body"> & { attachments?: { resource_type: string }[] },
): string {
  if (msg.type === "image") return `📷 ${msg.body || "Photo"}`;
  if (msg.attachments?.[0]?.resource_type === "video") return `🎥 ${msg.body || "Video"}`;
  if (msg.type === "file") return `📎 ${msg.body || "File"}`;
  return msg.body;
}

export function replySummary(reply: ReplyPreview): string {
  if (reply.type === "image") return reply.body || "Photo";
  if (reply.type === "file") return reply.body || "File";
  return reply.body;
}

export function listPreview(msg: Message | ChatMessage, conv: Conversation, meId: number, contacts?: Contact[]): string {
  const summary = messageSummary(msg);
  if (msg.type === "system") return summary;
  if (msg.sender_id === meId) return `You: ${summary}`;
  if (conv.type === "group") return `${senderName(conv, msg.sender_id, meId, contacts).split(" ")[0]}: ${summary}`;
  return summary;
}

export function isMuted(conv: Conversation): boolean {
  return !!conv.muted_until && Date.parse(conv.muted_until) > Date.now();
}

/** Stable colour for a sender's name in group chats. */
const NAME_COLOR_COUNT = 8; // --name-0 ... --name-7 in globals.css, swapped for dark mode
export function nameColor(userId: number | null): string {
  return `var(--name-${(userId ?? 0) % NAME_COLOR_COUNT})`;
}

export function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // randomUUID needs a secure context (https or localhost); fall back for LAN testing.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
