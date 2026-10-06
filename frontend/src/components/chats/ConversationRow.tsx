"use client";

import Link from "next/link";
import { BellOff } from "lucide-react";
import { conversationAvatar, conversationTitle, isMuted, listPreview, otherMember, senderName } from "@/lib/conversation";
import { formatListTime } from "@/lib/format";
import type { Conversation } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { Avatar } from "@/components/ui/Avatar";
import { StatusIcon } from "@/components/chat/StatusIcon";

interface Props {
  conv: Conversation;
  active: boolean;
  now: Date;
  /** Collapsed list (md+ only): avatar with an unread dot, no text. */
  compact?: boolean;
}

function UnreadBadge({ count, muted, className = "" }: { count: number; muted: boolean; className?: string }) {
  return (
    <span
      className={`min-w-5 shrink-0 rounded-full px-1.5 text-center text-[12px] leading-5 font-semibold ${muted ? "bg-muted text-white" : "bg-accent text-on-accent"} ${className}`}
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function ConversationRow({ conv, active, now, compact = false }: Props) {
  const me = useAuth((s) => s.user)!;
  const contacts = useChat((s) => s.contacts);
  // Select the stored object (stable reference), derive the array outside the selector.
  const typingMap = useChat((s) => s.typing[conv.id]);
  const typingUsers = Object.keys(typingMap ?? {})
    .map(Number)
    .filter((id) => id !== me.id);
  // Show my newest optimistic message right away, before the server acks it.
  const pendingLast = useChat((s) => s.messages[conv.id]?.items.at(-1));
  const peerOnline = useChat((s) => {
    const other = conv.type === "direct" ? otherMember(conv, me.id)?.user : undefined;
    return other ? (s.presence[other.id]?.online ?? other.online) : false;
  });

  const title = conversationTitle(conv, me.id, contacts);
  const avatar = conversationAvatar(conv, me.id, contacts);
  const last = pendingLast?.pending ? pendingLast : conv.last_message;
  const muted = isMuted(conv);
  const unread = conv.unread_count;

  let preview: React.ReactNode = last ? listPreview(last, conv, me.id, contacts) : "";
  if (typingUsers.length > 0) {
    const who = conv.type === "group" ? `${senderName(conv, typingUsers[0], me.id, contacts).split(" ")[0]} is ` : "";
    preview = <span className="text-accent">{who}typing…</span>;
  } else if (!last && conv.type === "direct") {
    preview = <span className="italic">Say hi 👋</span>;
  }

  return (
    <Link
      href={`/chats/${conv.id}`}
      aria-current={active ? "page" : undefined}
      title={compact ? title : undefined}
      className={`mx-2.5 flex items-start gap-3 rounded-xl px-3 py-3 transition-colors ${compact ? "md:justify-center md:px-0" : ""} ${active ? "bg-selected" : "hover:bg-hover"}`}
    >
      <div className="relative shrink-0">
        <Avatar {...avatar} size={48} online={peerOnline} />
        {compact && unread > 0 && <UnreadBadge count={unread} muted={muted} className="absolute -top-1 -right-1 hidden md:block" />}
      </div>
      <div className={`min-w-0 flex-1 ${compact ? "md:hidden" : ""}`}>
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] leading-5 font-semibold">{title}</span>
          <span className="shrink-0 text-[12px] text-secondary">{formatListTime(conv.last_message_at, now)}</span>
        </div>
        <div className="mt-0.5 flex items-start gap-1.5">
          <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-4.75 wrap-break-word text-secondary">{preview}</span>
          <span className="mt-0.5 flex shrink-0 items-center gap-1">
            {muted && <BellOff size={14} className="text-muted" aria-label="Muted" />}
            {unread > 0 ? (
              <UnreadBadge count={unread} muted={muted} />
            ) : (
              last?.sender_id === me.id &&
              last.status && <StatusIcon status={last.status} className="text-secondary" />
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}
