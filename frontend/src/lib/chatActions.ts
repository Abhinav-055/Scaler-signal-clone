// User actions that combine the store, the socket and the REST API.
import { api } from "@/lib/api";
import { newClientId } from "@/lib/conversation";
import type { AttachmentInput, ChatMessage, Contact, Conversation, LocalUpload, SendPayload } from "@/lib/types";
import { uploadToCloudinary } from "@/lib/upload";
import { realtime } from "@/lib/ws";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { useSettings } from "@/store/settings";
import { toast } from "@/store/ui";

/** Files of messages still uploading, kept so a failed upload can be retried. */
const pendingFiles = new Map<string, File>();

function optimisticMessage(conversationId: number, body: string, replyTo?: ChatMessage): ChatMessage {
  const me = useAuth.getState().user!;
  return {
    id: 0,
    conversation_id: conversationId,
    sender_id: me.id,
    client_id: newClientId(),
    type: "text",
    body,
    reply_to_id: replyTo?.id ?? null,
    reply_to: replyTo
      ? {
          id: replyTo.id,
          sender_id: replyTo.sender_id,
          type: replyTo.type,
          body: replyTo.body,
          has_attachment: replyTo.attachments.length > 0,
        }
      : null,
    created_at: new Date().toISOString(),
    edited_at: null,
    expires_at: null,
    attachments: [],
    reactions: [],
    status: "sending",
    pending: true,
  };
}

/** Put the payload in the outbox and try to send it. If the socket is down it goes out on reconnect. */
function dispatch(payload: SendPayload): void {
  useChat.getState().queueOutbox(payload);
  realtime.send("message.send", payload);
}

export function sendText(conversationId: number, body: string, replyTo?: ChatMessage): void {
  const msg = optimisticMessage(conversationId, body, replyTo);
  useChat.getState().addOptimistic(msg);
  dispatch({ client_id: msg.client_id, conversation_id: conversationId, body, reply_to_id: msg.reply_to_id });
}

async function uploadAndSend(msg: ChatMessage, file: File): Promise<void> {
  const { updatePending } = useChat.getState();
  const setProgress = (progress: number) => {
    const upload = { ...msg.uploads![0], progress };
    updatePending(msg.conversation_id, msg.client_id, { uploads: [upload] });
  };
  try {
    const attachment: AttachmentInput = await uploadToCloudinary(file, "attachment", setProgress);
    pendingFiles.delete(msg.client_id);
    dispatch({
      client_id: msg.client_id,
      conversation_id: msg.conversation_id,
      body: msg.body,
      reply_to_id: msg.reply_to_id,
      attachments: [attachment],
    });
  } catch (err) {
    updatePending(msg.conversation_id, msg.client_id, {
      status: "failed",
      error: err instanceof Error ? err.message : "Upload failed",
    });
  }
}

/** One message per file; the caption goes on the first one. */
export function sendFiles(conversationId: number, files: File[], caption: string, replyTo?: ChatMessage): void {
  files.forEach((file, i) => {
    const msg = optimisticMessage(conversationId, i === 0 ? caption : "", i === 0 ? replyTo : undefined);
    const isImage = file.type.startsWith("image/");
    const upload: LocalUpload = {
      name: file.name,
      size: file.size,
      mimeType: file.type,
      // Local preview while uploading: images and videos can be shown straight from the file.
      previewUrl: isImage || file.type.startsWith("video/") ? URL.createObjectURL(file) : null,
      progress: 0,
    };
    msg.type = isImage ? "image" : "file";
    msg.uploads = [upload];
    useChat.getState().addOptimistic(msg);
    pendingFiles.set(msg.client_id, file);
    void uploadAndSend(msg, file);
  });
}

/** Retry a failed message: re-upload if the upload failed, otherwise resend the payload. */
export function retryMessage(msg: ChatMessage): void {
  const { updatePending, outbox } = useChat.getState();
  updatePending(msg.conversation_id, msg.client_id, { status: "sending", error: undefined });
  const file = pendingFiles.get(msg.client_id);
  if (file) {
    void uploadAndSend(msg, file);
    return;
  }
  const payload = outbox[msg.client_id] ?? {
    client_id: msg.client_id,
    conversation_id: msg.conversation_id,
    body: msg.body,
    reply_to_id: msg.reply_to_id,
  };
  dispatch(payload);
}

/** After reconnecting, resend everything that was never acknowledged (client_id makes it safe). */
export function resendOutbox(): void {
  for (const payload of Object.values(useChat.getState().outbox)) {
    realtime.send("message.send", payload);
  }
}

/** Mark everything visible in a conversation as read. */
export function markConversationRead(conversationId: number): void {
  const { conversations, messages, patchConversation } = useChat.getState();
  const me = useAuth.getState().user;
  const conv = conversations[conversationId];
  const items = messages[conversationId]?.items;
  if (!conv || !items || !me || !conv.is_active_member) return;

  const lastRead = conv.last_read_message_id ?? 0;
  const serverItems = items.filter((m) => !m.pending);
  const newest = serverItems.at(-1)?.id ?? 0;
  if (newest <= lastRead && conv.unread_count === 0) return;

  const unreadIncoming = serverItems
    .filter((m) => m.id > lastRead && m.sender_id !== me.id && m.type !== "system")
    .map((m) => m.id);

  const sentReceipt =
    useSettings.getState().readReceipts &&
    unreadIncoming.length > 0 &&
    realtime.send("receipt.read", { message_ids: unreadIncoming });
  if (!sentReceipt) {
    // Read receipts off (or socket down): move the read pointer without telling the sender.
    void api(`/conversations/${conversationId}/read`, { method: "POST", body: { message_id: newest } }).catch(() => {});
  }
  patchConversation(conversationId, { unread_count: 0, last_read_message_id: Math.max(newest, lastRead) });
}

let lastTypingSent = 0;
let typingStopTimer: ReturnType<typeof setTimeout> | null = null;

/** Called on every keystroke; sends typing.start at most every 3s and typing.stop after 4s idle. */
export function notifyTyping(conversationId: number): void {
  if (!useSettings.getState().typingIndicators) return;
  const now = Date.now();
  if (now - lastTypingSent > 3000) {
    realtime.send("typing.start", { conversation_id: conversationId });
    lastTypingSent = now;
  }
  if (typingStopTimer) clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(() => stopTyping(conversationId), 4000);
}

export function stopTyping(conversationId: number): void {
  if (typingStopTimer) clearTimeout(typingStopTimer);
  typingStopTimer = null;
  if (lastTypingSent === 0) return;
  lastTypingSent = 0;
  realtime.send("typing.stop", { conversation_id: conversationId });
}

/** Open (or create) the direct conversation with a user and return its id. */
export async function openDirectChat(userId: number): Promise<number> {
  const conv = await api<Conversation>("/conversations", {
    method: "POST",
    body: { type: "direct", user_id: userId },
  });
  useChat.getState().upsertConversation(conv);
  return conv.id;
}

/** Add (or rename) a contact by user id, phone or username, then refresh the contacts list. */
export async function addContact(
  target: { user_id: number } | { phone: string } | { username: string },
  nickname?: string,
): Promise<Contact> {
  const contact = await api<Contact>("/contacts", { method: "POST", body: { ...target, nickname } });
  await useChat.getState().loadContacts();
  toast(`${contact.nickname || contact.user.display_name} added to contacts`);
  return contact;
}

export async function removeContact(userId: number, name: string): Promise<void> {
  try {
    await api(`/contacts/${userId}`, { method: "DELETE" });
    await useChat.getState().loadContacts();
    toast(`${name} removed from contacts`);
  } catch {
    toast("Could not remove contact");
  }
}
