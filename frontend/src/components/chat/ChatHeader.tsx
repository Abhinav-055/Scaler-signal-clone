"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, Bell, BellOff, Info, MoreHorizontal, Phone, Search, ShieldCheck, Timer, Video } from "lucide-react";
import { api } from "@/lib/api";
import { conversationAvatar, conversationTitle, isMuted, otherMember, senderName } from "@/lib/conversation";
import { DISAPPEARING_OPTIONS, formatLastSeen } from "@/lib/format";
import type { Conversation } from "@/lib/types";
import { useChat } from "@/store/chat";
import { toast } from "@/store/ui";
import { useNow } from "@/hooks/useNow";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/controls";
import { Menu, type MenuItem } from "@/components/ui/Menu";

const MUTE_FOREVER = "9999-12-31T00:00:00Z";

export async function updateConversation(conv: Conversation, patch: Record<string, unknown>): Promise<void> {
  try {
    const updated = await api<Conversation>(`/conversations/${conv.id}`, { method: "PATCH", body: patch });
    useChat.getState().upsertConversation(updated);
  } catch (err) {
    toast(err instanceof Error ? err.message : "Could not update the conversation");
  }
}

interface Props {
  conv: Conversation;
  meId: number;
  onOpenDetails: () => void;
  onSafetyNumber: () => void;
  onSearch: () => void;
}

export function ChatHeader({ conv, meId, onOpenDetails, onSafetyNumber, onSearch }: Props) {
  const contacts = useChat((s) => s.contacts);
  const typingMap = useChat((s) => s.typing[conv.id]);
  const peer = conv.type === "direct" ? otherMember(conv, meId)?.user : undefined;
  const presence = useChat((s) => (peer ? s.presence[peer.id] : undefined));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const now = useNow();

  const title = conversationTitle(conv, meId, contacts);
  const avatar = conversationAvatar(conv, meId, contacts);
  const muted = isMuted(conv);
  const typers = Object.keys(typingMap ?? {})
    .map(Number)
    .filter((id) => id !== meId);

  let subtitle: React.ReactNode;
  if (typers.length > 0) {
    const who = conv.type === "group" ? `${senderName(conv, typers[0], meId, contacts).split(" ")[0]} is ` : "";
    subtitle = <span className="text-accent">{who}typing…</span>;
  } else if (peer) {
    const online = presence?.online ?? peer.online;
    subtitle = online ? "Online" : formatLastSeen(presence?.last_seen_at ?? peer.last_seen_at, now);
  } else {
    const active = conv.members.filter((m) => !m.left_at);
    subtitle = `${active.length} members`;
  }

  const comingSoon = () => toast("Calls are coming soon");
  const timer = DISAPPEARING_OPTIONS.find((o) => o.seconds === conv.disappearing_seconds && o.seconds);

  const items: MenuItem[] = [
    { label: conv.type === "group" ? "Group settings" : "Chat settings", icon: <Info size={16} />, onSelect: onOpenDetails },
    {
      label: muted ? "Unmute notifications" : "Mute notifications",
      icon: muted ? <Bell size={16} /> : <BellOff size={16} />,
      onSelect: () => void updateConversation(conv, { muted_until: muted ? null : MUTE_FOREVER }),
    },
    {
      label: conv.archived ? "Unarchive" : "Archive",
      icon: <Archive size={16} />,
      onSelect: () => void updateConversation(conv, { archived: !conv.archived }),
    },
  ];
  if (peer) items.push({ label: "View safety number", icon: <ShieldCheck size={16} />, onSelect: onSafetyNumber });

  return (
    <header className="flex h-[64px] shrink-0 items-center gap-1 px-2 md:px-4">
      <Link href="/chats" className="rounded-full p-2 text-secondary hover:bg-hover md:hidden" aria-label="Back to chats">
        <ArrowLeft size={22} />
      </Link>
      <button onClick={onOpenDetails} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left" aria-label="Open conversation details">
        <Avatar {...avatar} size={32} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[16px] leading-5 font-semibold">{title}</span>
            {muted && <BellOff size={13} className="shrink-0 text-muted" aria-label="Muted" />}
          </div>
          <div className="truncate text-[12px] leading-4 text-secondary">{subtitle}</div>
        </div>
      </button>

      {timer && (
        <span className="hidden items-center gap-1 rounded-full bg-input px-2 py-1 text-[12px] text-secondary sm:flex" title="Disappearing messages">
          <Timer size={13} /> {timer.short}
        </span>
      )}
      {/* Signal shows only video for groups (group calls), video + voice for direct chats */}
      <IconButton label="Video call" onClick={comingSoon} className="text-text!">
        <Video size={22} strokeWidth={1.8} />
      </IconButton>
      {peer && (
        <IconButton label="Voice call" onClick={comingSoon} className="text-text!">
          <Phone size={20} strokeWidth={1.8} />
        </IconButton>
      )}
      <IconButton label="Search in chat" onClick={onSearch} className="text-text!">
        <Search size={21} strokeWidth={1.8} />
      </IconButton>
      <IconButton label="More options" onClick={(e) => setMenu({ x: e.clientX - 180, y: e.clientY + 12 })} className="text-text!">
        <MoreHorizontal size={22} strokeWidth={1.8} />
      </IconButton>
      {menu && <Menu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </header>
  );
}
