"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { conversationAvatar, conversationTitle, otherMember } from "@/lib/conversation";
import { formatDayDivider, formatPhone, isSameDay } from "@/lib/format";
import type { ChatMessage, Conversation } from "@/lib/types";
import { useChat } from "@/store/chat";
import { toast, useUi } from "@/store/ui";
import { useNow } from "@/hooks/useNow";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/controls";
import { MessageBubble } from "./MessageBubble";
import { TypingBubble } from "./TypingBubble";

const RUN_GAP_MS = 5 * 60_000; // consecutive messages within 5 minutes form one visual group
const NEAR_BOTTOM_PX = 120;
const LOAD_MORE_PX = 300;
const NO_MESSAGES: ChatMessage[] = [];

function sameRun(a: ChatMessage | undefined, b: ChatMessage | undefined): boolean {
  if (!a || !b || a.type === "system" || b.type === "system") return false;
  return (
    a.sender_id === b.sender_id &&
    isSameDay(a.created_at, b.created_at) &&
    Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < RUN_GAP_MS
  );
}

interface Props {
  conv: Conversation;
  meId: number;
  onOpenImage: (url: string, name: string) => void;
  onInfo: (msg: ChatMessage) => void;
}

export function MessageList({ conv, meId, onOpenImage, onInfo }: Props) {
  const state = useChat((s) => s.messages[conv.id]);
  const loadOlder = useChat((s) => s.loadOlder);
  const typingMap = useChat((s) => s.typing[conv.id]);
  const contacts = useChat((s) => s.contacts);
  const now = useNow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  /** Newest message id the user has seen at the bottom; anything newer counts as "new". */
  const [seenUpTo, setSeenUpTo] = useState(Infinity);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  // For keeping the scroll position steady when older messages are prepended.
  const prevRef = useRef<{ firstKey?: string; lastKey?: string; scrollHeight: number }>({ scrollHeight: 0 });

  const items = state?.items ?? NO_MESSAGES;
  const lastServerId = items.findLast((m) => !m.pending)?.id ?? 0;
  const newCount = items.filter(
    (m) => !m.pending && m.id > seenUpTo && m.sender_id !== meId && m.type !== "system",
  ).length;
  const typingUsers = Object.keys(typingMap ?? {})
    .map(Number)
    .filter((id) => id !== meId);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Decide how to scroll whenever the message list changes.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    const firstKey = items[0].client_id;
    const lastKey = items[items.length - 1].client_id;
    const prev = prevRef.current;

    if (prev.lastKey === undefined) {
      el.scrollTop = el.scrollHeight; // first render: start at the bottom
    } else if (firstKey !== prev.firstKey && lastKey === prev.lastKey) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight; // older page prepended
    } else if (lastKey !== prev.lastKey) {
      // New message at the bottom: follow it if we were at the bottom or it is mine.
      // Otherwise it stays below and is counted on the "jump to bottom" button.
      const last = items[items.length - 1];
      if (atBottomRef.current || last.sender_id === meId) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
    prevRef.current = { firstKey, lastKey, scrollHeight: el.scrollHeight };
  }, [items, meId]);

  // Stay pinned to the bottom while content grows under us (images finish loading,
  // reactions are added, the typing bubble appears) - but only if we were at the bottom.
  const loaded = !!state?.loaded;
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [loaded]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < NEAR_BOTTOM_PX;
    setShowJump(!atBottomRef.current);
    if (atBottomRef.current) setSeenUpTo(lastServerId);
    if (el.scrollTop < LOAD_MORE_PX && state?.hasMore && !state.loadingOlder) {
      prevRef.current.scrollHeight = el.scrollHeight;
      void loadOlder(conv.id);
    }
  }

  /** Scroll to a quoted message, loading older pages until it is found. */
  const jumpTo = useCallback(
    async (messageId: number) => {
      for (let i = 0; i < 10; i++) {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightId(messageId);
          setTimeout(() => setHighlightId(null), 1600);
          return;
        }
        const s = useChat.getState().messages[conv.id];
        if (!s?.hasMore) break;
        await useChat.getState().loadOlder(conv.id);
        await new Promise((r) => requestAnimationFrame(r));
      }
      toast("The original message is no longer available");
    },
    [conv.id],
  );

  // Jump requests from outside the list (in-chat search).
  useEffect(
    () =>
      useUi.subscribe(({ jumpTarget }) => {
        if (jumpTarget?.conversationId !== conv.id) return;
        useUi.setState({ jumpTarget: null }); // consume it, so reopening the chat doesn't jump again
        void jumpTo(jumpTarget.messageId);
      }),
    [conv.id, jumpTo],
  );

  if (!state?.loaded) {
    return (
      <div className="flex-1 space-y-3 overflow-hidden p-5" aria-label="Loading messages">
        {[40, 60, 30, 55, 45, 35].map((w, i) => (
          <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
            <div className="skeleton h-9 rounded-2xl" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    );
  }

  const avatar = conversationAvatar(conv, meId, contacts);
  const peer = conv.type === "direct" ? otherMember(conv, meId)?.user : undefined;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        // overflow-anchor: none, because we correct the scroll position ourselves when prepending
        className="h-full overflow-y-auto overscroll-contain pt-2 pb-3 [overflow-anchor:none]"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        <div ref={contentRef}>
        {/* Conversation hero + encryption notice once the very start of the history is loaded */}
        {!state.hasMore && (
          <div className="flex flex-col items-center px-6 pt-8 pb-6 text-center">
            <Avatar {...avatar} size={80} />
            <h2 className="mt-3 text-[20px] font-semibold">{conversationTitle(conv, meId, contacts)}</h2>
            <p className="mt-1 text-[13px] text-secondary">
              {peer
                ? [formatPhone(peer.phone), peer.username ? `@${peer.username}` : null].filter(Boolean).join(" · ")
                : `${conv.members.filter((m) => !m.left_at).length} members`}
            </p>
            {(peer?.about || conv.description) && (
              <p className="mt-1 max-w-sm text-[13px] text-secondary">{peer?.about || conv.description}</p>
            )}
            <div className="mt-4 flex max-w-sm items-start gap-2 rounded-xl bg-input px-3 py-2 text-left text-[12px] text-secondary">
              <Lock size={14} className="mt-0.5 shrink-0" />
              <span>Messages are end-to-end encrypted. (Simulated in this demo — see Safety number.)</span>
            </div>
          </div>
        )}

        {items.map((msg, i) => {
          const prev = items[i - 1];
          const next = items[i + 1];
          const showDate = !prev || !isSameDay(prev.created_at, msg.created_at);
          return (
            <div key={msg.client_id}>
              {showDate && (
                <div className="flex justify-center py-2">
                  <span className="rounded-full px-3 py-1 text-[12px] font-medium text-secondary">
                    {formatDayDivider(msg.created_at, now)}
                  </span>
                </div>
              )}
              <MessageBubble
                msg={msg}
                conv={conv}
                meId={meId}
                firstInRun={showDate || !sameRun(prev, msg)}
                lastInRun={!sameRun(msg, next) || (!!next && !isSameDay(msg.created_at, next.created_at))}
                highlighted={highlightId === msg.id}
                now={now}
                onJumpTo={jumpTo}
                onOpenImage={onOpenImage}
                onInfo={onInfo}
              />
            </div>
          );
        })}

        {typingUsers.length > 0 && <TypingBubble conv={conv} userIds={typingUsers} />}
        </div>
      </div>

      {state.loadingOlder && (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center text-secondary">
          <span className="rounded-full bg-elevated p-1.5 shadow-pop">
            <Spinner size={16} />
          </span>
        </div>
      )}

      {(showJump || newCount > 0) && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-elevated shadow-pop"
          aria-label={newCount > 0 ? `${newCount} new messages, scroll to bottom` : "Scroll to bottom"}
        >
          <ChevronDown size={20} />
          {newCount > 0 && (
            <span className="absolute -top-2 min-w-5 rounded-full bg-accent px-1 text-[11px] leading-5 font-semibold text-on-accent">
              {newCount}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
