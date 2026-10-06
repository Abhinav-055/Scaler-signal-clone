"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { markConversationRead, sendFiles } from "@/lib/chatActions";
import { conversationTitle, otherMember } from "@/lib/conversation";
import type { ChatMessage } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";
import { isWatching } from "@/hooks/useRealtime";
import { Spinner } from "@/components/ui/controls";
import { ChatHeader } from "./ChatHeader";
import { ChatSearchBar } from "./ChatSearchBar";
import { Composer } from "./Composer";
import { ConversationDetails } from "./ConversationDetails";
import { Lightbox } from "./Lightbox";
import { MessageInfoModal } from "./MessageInfoModal";
import { MessageList } from "./MessageList";
import { SafetyNumberModal } from "./SafetyNumberModal";

export function ChatPane({ conversationId }: { conversationId: number }) {
  const me = useAuth((s) => s.user)!;
  const conv = useChat((s) => s.conversations[conversationId]);
  const conversationsLoaded = useChat((s) => s.conversationsLoaded);
  const messages = useChat((s) => s.messages[conversationId]);
  const loadMessages = useChat((s) => s.loadMessages);
  const fetchConversation = useChat((s) => s.fetchConversation);
  const setActive = useUi((s) => s.setActiveConversation);
  const contacts = useChat((s) => s.contacts);

  const [details, setDetails] = useState(false);
  const [searching, setSearching] = useState(false);
  const [safety, setSafety] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [infoFor, setInfoFor] = useState<ChatMessage | null>(null);
  const [dragging, setDragging] = useState(false);
  const [missing, setMissing] = useState(false);

  // Register as the on-screen conversation (used for unread counts and notifications).
  useEffect(() => {
    setActive(conversationId);
    return () => setActive(null);
  }, [conversationId, setActive]);

  // A conversation we don't have yet (deep link, or just created by someone else).
  useEffect(() => {
    if (conversationsLoaded && !conv) {
      void fetchConversation(conversationId).then((c) => !c && setMissing(true));
    }
  }, [conversationsLoaded, conv, conversationId, fetchConversation]);

  useEffect(() => {
    if (conv) void loadMessages(conversationId).catch(() => setMissing(true));
  }, [conv, conversationId, loadMessages]);

  // Mark read whenever new messages show up while we're looking, and when the window regains focus.
  const markRead = useCallback(() => {
    if (isWatching(conversationId)) markConversationRead(conversationId);
  }, [conversationId]);

  useEffect(markRead, [messages?.items.length, conv?.unread_count, markRead]);
  useEffect(() => {
    window.addEventListener("focus", markRead);
    document.addEventListener("visibilitychange", markRead);
    return () => {
      window.removeEventListener("focus", markRead);
      document.removeEventListener("visibilitychange", markRead);
    };
  }, [markRead]);

  // Esc: close the details panel, otherwise cancel the reply. (Modals/menus catch Esc first.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || useUi.getState().modal) return;
      if (details) setDetails(false);
      else if (useUi.getState().replyTo[conversationId]) useUi.getState().setReplyTo(conversationId, undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [details, conversationId]);

  if (missing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-secondary">
        <p>This conversation doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link href="/chats" className="text-accent">
          Back to chats
        </Link>
      </div>
    );
  }
  if (!conv) {
    return (
      <div className="flex flex-1 items-center justify-center text-secondary">
        <Spinner />
      </div>
    );
  }

  const peer = conv.type === "direct" ? otherMember(conv, me.id)?.user : undefined;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = [...e.dataTransfer.files];
    if (files.length && conv?.is_active_member) sendFiles(conversationId, files, "", useUi.getState().replyTo[conversationId]);
  }

  return (
    <div
      className="relative flex h-full min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      {details ? (
        <ConversationDetails conv={conv} meId={me.id} onClose={() => setDetails(false)} onSafetyNumber={() => setSafety(true)} />
      ) : (
        <>
          <ChatHeader
            conv={conv}
            meId={me.id}
            onOpenDetails={() => setDetails(true)}
            onSafetyNumber={() => setSafety(true)}
            onSearch={() => setSearching(true)}
          />
          {searching && <ChatSearchBar key={conv.id} conversationId={conv.id} onClose={() => setSearching(false)} />}
          <MessageList
            conv={conv}
            meId={me.id}
            onOpenImage={(url, name) => setLightbox({ url, name })}
            onInfo={setInfoFor}
          />
          <Composer conv={conv} meId={me.id} />
        </>
      )}

      {dragging && conv.is_active_member && (
        <div className="pointer-events-none absolute inset-2 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent bg-bg/90 text-accent">
          <Upload size={32} />
          <span className="font-medium">Drop files to send to {conversationTitle(conv, me.id, contacts)}</span>
        </div>
      )}
      {lightbox && <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />}
      {infoFor && <MessageInfoModal msg={infoFor} conv={conv} onClose={() => setInfoFor(null)} />}
      {safety && peer && (
        <SafetyNumberModal meId={me.id} peerId={peer.id} peerName={peer.display_name} onClose={() => setSafety(false)} />
      )}
    </div>
  );
}
