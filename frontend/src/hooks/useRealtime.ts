"use client";

// Connects the WebSocket once for the logged-in app and routes every server event into the stores.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markConversationRead, resendOutbox } from "@/lib/chatActions";
import { conversationTitle, isMuted, listPreview } from "@/lib/conversation";
import { showMessageNotification } from "@/lib/notify";
import type { Conversation, Member, Message, Reaction, ServerStatus } from "@/lib/types";
import { realtime, type ServerFrame } from "@/lib/ws";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { useSettings } from "@/store/settings";
import { toast, useUi } from "@/store/ui";

/** The user is looking at this conversation right now (tab focused + chat open). */
export function isWatching(conversationId: number): boolean {
  return (
    useUi.getState().activeConversationId === conversationId &&
    document.visibilityState === "visible" &&
    document.hasFocus()
  );
}

async function onNewMessage(msg: Message, navigate: (path: string) => void): Promise<void> {
  const chat = useChat.getState();
  const me = useAuth.getState().user;
  if (!me) return;

  let conv: Conversation | null = chat.conversations[msg.conversation_id] ?? null;
  chat.receiveMessage(msg);
  if (!conv) {
    // First message of a conversation we didn't know about (someone started a chat with us).
    conv = await chat.fetchConversation(msg.conversation_id);
    if (!conv) return;
  }
  if (msg.sender_id === me.id || msg.type === "system") return;

  chat.setTyping(msg.conversation_id, msg.sender_id ?? 0, false);
  // It reached this device: tell the sender (✓✓).
  realtime.send("receipt.delivered", { message_ids: [msg.id] });

  if (isWatching(msg.conversation_id)) {
    markConversationRead(msg.conversation_id);
    return;
  }
  const current = useChat.getState().conversations[msg.conversation_id];
  if (current) chat.patchConversation(msg.conversation_id, { unread_count: current.unread_count + 1 });
  if (!isMuted(conv)) {
    showMessageNotification(conversationTitle(conv, me.id), listPreview(msg, conv, me.id), () =>
      navigate(`/chats/${msg.conversation_id}`),
    );
  }
}

function handleFrame(frame: ServerFrame, navigate: (path: string) => void): void {
  const chat = useChat.getState();
  switch (frame.type) {
    case "message.ack": {
      const { client_id, message } = frame.payload as { client_id: string; message: Message };
      chat.clearOutbox(client_id);
      chat.receiveMessage(message);
      break;
    }
    case "message.new":
      void onNewMessage(frame.payload as Message, navigate);
      break;
    case "receipt.updated": {
      const p = frame.payload as { conversation_id: number; updates: { message_id: number; status: ServerStatus }[] };
      chat.applyStatuses(p.conversation_id, p.updates);
      break;
    }
    case "typing": {
      const p = frame.payload as { conversation_id: number; user_id: number; is_typing: boolean };
      // Signal's rule: if you hide your typing, you don't see others' either.
      if (useSettings.getState().typingIndicators) chat.setTyping(p.conversation_id, p.user_id, p.is_typing);
      break;
    }
    case "presence": {
      const p = frame.payload as { user_id: number; online: boolean; last_seen_at: string };
      chat.setPresence(p.user_id, { online: p.online, last_seen_at: p.last_seen_at });
      break;
    }
    case "reaction.updated": {
      const p = frame.payload as { conversation_id: number; message_id: number; reactions: Reaction[] };
      chat.applyReactions(p.conversation_id, p.message_id, p.reactions);
      break;
    }
    case "conversation.updated": {
      const conv = frame.payload as Conversation;
      const before = chat.conversations[conv.id];
      chat.upsertConversation(conv);
      if (before?.is_active_member && !conv.is_active_member) toast(`You are no longer in “${conv.name}”`);
      break;
    }
    case "member.updated": {
      const p = frame.payload as { conversation_id: number; member: Member };
      chat.upsertMember(p.conversation_id, p.member);
      break;
    }
    case "message.expired": {
      const p = frame.payload as { conversation_id: number; message_ids: number[] };
      chat.removeMessages(p.conversation_id, p.message_ids);
      const last = chat.conversations[p.conversation_id]?.last_message;
      if (last && p.message_ids.includes(last.id)) void chat.fetchConversation(p.conversation_id);
      break;
    }
    case "error": {
      const p = frame.payload as { message: string; client_id?: string | null };
      if (p.client_id) {
        chat.clearOutbox(p.client_id);
        for (const [convId, state] of Object.entries(chat.messages)) {
          if (state.items.some((m) => m.client_id === p.client_id)) {
            chat.updatePending(Number(convId), p.client_id, { status: "failed", error: p.message });
          }
        }
      }
      toast(p.message);
      break;
    }
    default:
      break; // pong and unknown events
  }
}

/** Bring everything up to date after (re)connecting: missed messages, unread counts, outbox. */
async function resync(): Promise<void> {
  const chat = useChat.getState();
  try {
    await chat.loadConversations();
    const loaded = Object.keys(chat.messages).map(Number);
    await Promise.all(loaded.map((id) => chat.refreshLatest(id)));
  } catch {
    // will retry on the next reconnect
  }
  resendOutbox();
  const active = useUi.getState().activeConversationId;
  if (active && isWatching(active)) markConversationRead(active);
}

export function useRealtime(): void {
  const router = useRouter();
  const token = useAuth((s) => s.token);

  useEffect(() => {
    if (!token) return;
    const navigate = (path: string) => router.push(path);
    let connectedBefore = false;

    const offFrame = realtime.onFrame((frame) => handleFrame(frame, navigate));
    const offStatus = realtime.onStatus((status) => {
      useChat.getState().setSocketStatus(status);
      if (status === "open") {
        if (connectedBefore) void resync();
        else resendOutbox();
        connectedBefore = true;
      }
    });
    realtime.onUnauthorized = () => useAuth.getState().reset();
    realtime.connect(token);

    const onOnline = () => realtime.reconnectNow();
    window.addEventListener("online", onOnline);
    return () => {
      offFrame();
      offStatus();
      window.removeEventListener("online", onOnline);
      realtime.disconnect();
    };
  }, [token, router]);
}
