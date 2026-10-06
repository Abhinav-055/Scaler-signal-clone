"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";
import { IconButton } from "@/components/ui/controls";

/**
 * Search inside the open chat (header search icon). Matches the messages loaded in this
 * chat, newest first; Enter / ↓ goes to the next older match, Shift+Enter / ↑ to a newer one.
 */
export function ChatSearchBar({ conversationId, onClose }: { conversationId: number; onClose: () => void }) {
  const items = useChat((s) => s.messages[conversationId]?.items);
  const jumpToMessage = useUi((s) => s.jumpToMessage);
  const [query, setQuery] = useState("");
  /** Position in `matches` we last jumped to; -1 = not jumped yet for this query. */
  const [index, setIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const q = query.trim().toLowerCase();
  const matches = q
    ? (items ?? [])
        .filter((m) => !m.pending && m.type !== "system" && m.body.toLowerCase().includes(q))
        .map((m) => m.id)
        .reverse() // newest first
    : [];

  function go(next: number) {
    if (matches.length === 0) return;
    const i = (next + matches.length) % matches.length;
    setIndex(i);
    jumpToMessage(conversationId, matches[i]);
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 pb-2 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-input px-2.5">
        <Search size={16} className="shrink-0 text-secondary" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            } else if ((e.key === "Enter" && !e.shiftKey) || e.key === "ArrowDown") {
              e.preventDefault();
              go(index + 1); // first press: newest match, then step back in time
            } else if (e.key === "Enter" || e.key === "ArrowUp") {
              e.preventDefault();
              go(index - 1);
            }
          }}
          placeholder="Search messages in this chat"
          aria-label="Search messages in this chat"
          className="h-[30px] min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-secondary"
        />
        {q && (
          <span className="shrink-0 text-[12px] text-secondary" aria-live="polite">
            {matches.length === 0
              ? "No results"
              : index < 0
                ? `${matches.length} found`
                : `${index + 1} of ${matches.length}`}
          </span>
        )}
      </div>
      <IconButton label="Newer match" onClick={() => go(index - 1)} disabled={matches.length === 0}>
        <ChevronUp size={18} />
      </IconButton>
      <IconButton label="Older match" onClick={() => go(index + 1)} disabled={matches.length === 0}>
        <ChevronDown size={18} />
      </IconButton>
      <IconButton label="Close search" onClick={onClose}>
        <X size={18} />
      </IconButton>
    </div>
  );
}
