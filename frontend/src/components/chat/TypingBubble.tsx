"use client";

import type { Conversation } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";

/** Incoming grey bubble with three bouncing dots. */
export function TypingBubble({ conv, userIds }: { conv: Conversation; userIds: number[] }) {
  const typer = conv.members.find((m) => m.user.id === userIds[0])?.user;
  return (
    <div className="flex items-end gap-2 px-3 pb-3 md:px-5" aria-label={`${typer?.display_name ?? "Someone"} is typing`}>
      {conv.type === "group" && typer && (
        <Avatar name={typer.display_name} url={typer.avatar_url} color={typer.avatar_color} size={28} />
      )}
      <div className="flex h-9 items-center gap-1 rounded-[18px] bg-bubble-in px-4">
        <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
        <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
        <span className="typing-dot h-2 w-2 rounded-full bg-secondary" />
      </div>
    </div>
  );
}
