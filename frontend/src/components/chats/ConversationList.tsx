"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, Keyboard, MoreHorizontal, Search, SquarePen, UserPlus, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { addContact, openDirectChat } from "@/lib/chatActions";
import { conversationTitle, displayName, otherMember } from "@/lib/conversation";
import { formatPhone } from "@/lib/format";
import type { User } from "@/lib/types";
import { useAuth } from "@/store/auth";
import { sortedConversations, useChat } from "@/store/chat";
import { useSettings } from "@/store/settings";
import { toast, useUi } from "@/store/ui";
import { useNow } from "@/hooks/useNow";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton, Skeleton } from "@/components/ui/controls";
import { Menu } from "@/components/ui/Menu";
import { ConversationRow } from "./ConversationRow";

/**
 * Signal Desktop's left column. `compact` (from the rail's hamburger) shows only avatars on
 * tablet/desktop; phones always get the full list, so compact styles are all `md:` prefixed.
 */
export function ConversationList({ compact = false }: { compact?: boolean }) {
  const conversations = useChat((s) => s.conversations);
  const loaded = useChat((s) => s.conversationsLoaded);
  const activeId = useUi((s) => s.activeConversationId);
  const openModal = useUi((s) => s.openModal);
  const searchFocusTick = useUi((s) => s.searchFocusTick);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const setSettings = useSettings((s) => s.set);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  useEffect(() => {
    if (searchFocusTick === 0) return;
    // Ctrl+K while collapsed: expand first so the search box is visible.
    if (useSettings.getState().listCollapsed) setSettings({ listCollapsed: false });
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [searchFocusTick, setSettings]);

  // Compact mode hides these on md+ screens (phones always show them).
  const hideWhenCompact = compact ? "md:hidden" : "";

  const all = useMemo(() => sortedConversations(conversations), [conversations]);
  const visible = all.filter((c) => c.archived === showArchived);
  const archivedCount = all.filter((c) => c.archived).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className={`flex h-[60px] shrink-0 items-center gap-1 pr-3 pl-5 ${compact ? "md:justify-center md:px-0" : ""}`}>
        {showArchived ? (
          <>
            <IconButton label="Back to chats" onClick={() => setShowArchived(false)} className="-ml-2">
              <ChevronLeft size={22} />
            </IconButton>
            <h1 className={`flex-1 truncate text-[20px] font-semibold ${hideWhenCompact}`}>Archived chats</h1>
          </>
        ) : (
          <>
            <h1 className={`flex-1 text-[20px] font-semibold ${hideWhenCompact}`}>Chats</h1>
            <IconButton label="New chat (Alt+N)" onClick={() => openModal("newChat")} className="text-text!">
              <SquarePen size={20} strokeWidth={1.8} />
            </IconButton>
            <IconButton
              label="More chat options"
              onClick={(e) => setMenu({ x: e.clientX - 160, y: e.clientY + 14 })}
              className={`text-text! ${hideWhenCompact}`}
            >
              <MoreHorizontal size={20} />
            </IconButton>
          </>
        )}
      </header>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "New group", icon: <Users size={16} />, onSelect: () => openModal("newGroup") },
            {
              label: archivedCount > 0 ? `Archived chats (${archivedCount})` : "Archived chats",
              icon: <Archive size={16} />,
              onSelect: () => setShowArchived(true),
            },
            { label: "Keyboard shortcuts", icon: <Keyboard size={16} />, onSelect: () => openModal("shortcuts") },
          ]}
        />
      )}

      {compact && (
        <div className="hidden justify-center pb-2 md:flex">
          <IconButton label="Search" onClick={() => useUi.getState().focusSearch()} className="text-text!">
            <Search size={20} strokeWidth={1.8} />
          </IconButton>
        </div>
      )}
      <div className={`px-4 pb-3 ${hideWhenCompact}`}>
        <div className="flex items-center gap-2 rounded-lg bg-input px-2.5">
          <Search size={17} className="shrink-0 text-secondary" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
            placeholder="Search"
            aria-label="Search chats, contacts and people"
            className="h-[30px] min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-secondary"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search" className="text-secondary">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {query.trim() ? (
          <SearchResults query={query.trim()} onDone={() => setQuery("")} />
        ) : !loaded ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <p className={`px-6 py-10 text-center text-secondary ${hideWhenCompact}`}>
            {showArchived ? "No archived chats." : "No chats yet. Start one with the compose button."}
          </p>
        ) : (
          <>
            {visible.map((c) => (
              <ConversationRow key={c.id} conv={c} active={c.id === activeId} now={now} compact={compact} />
            ))}
            {!showArchived && archivedCount > 0 && (
              <button
                onClick={() => setShowArchived(true)}
                aria-label={`Archived chats (${archivedCount})`}
                className="mx-2.5 mt-1 flex w-[calc(100%-1.25rem)] items-center gap-3 rounded-xl px-3 py-3 text-secondary hover:bg-hover"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-input">
                  <Archive size={20} />
                </span>
                <span className={hideWhenCompact}>Archived chats ({archivedCount})</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="mx-2 flex items-center gap-3 px-2.5 py-2.5">
          <Skeleton className="h-12 w-12 rounded-full!" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Search across conversations, contacts and every other user on the server. */
function SearchResults({ query, onDone }: { query: string; onDone: () => void }) {
  const router = useRouter();
  const me = useAuth((s) => s.user)!;
  const conversations = useChat((s) => s.conversations);
  const contacts = useChat((s) => s.contacts);
  const [people, setPeople] = useState<User[]>([]);
  const q = query.toLowerCase();

  useEffect(() => {
    // Debounce the server search while typing.
    const t = setTimeout(() => {
      api<User[]>(`/users/search?q=${encodeURIComponent(query)}`)
        .then(setPeople)
        .catch(() => setPeople([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const chats = sortedConversations(conversations).filter((c) => {
    if (conversationTitle(c, me.id, contacts).toLowerCase().includes(q)) return true;
    return c.type === "group" && c.members.some((m) => m.user.display_name.toLowerCase().includes(q));
  });
  const directWith = new Set(
    Object.values(conversations)
      .filter((c) => c.type === "direct")
      .map((c) => otherMember(c, me.id)?.user.id),
  );
  const matchingContacts = contacts.filter(
    (c) =>
      displayName(c.user, contacts).toLowerCase().includes(q) ||
      c.user.username?.includes(q.replace(/^@/, "")) ||
      c.user.phone.includes(q.replace(/\s/g, "")),
  );
  const contactIds = new Set(contacts.map((c) => c.user.id));
  const others = people.filter((u) => !contactIds.has(u.id));

  async function openUser(userId: number) {
    try {
      const id = await openDirectChat(userId);
      onDone();
      router.push(`/chats/${id}`);
    } catch {
      toast("Could not open that chat");
    }
  }

  const empty = chats.length === 0 && matchingContacts.length === 0 && others.length === 0;
  return (
    <div>
      {chats.length > 0 && <SectionLabel>Chats</SectionLabel>}
      {chats.map((c) => (
        <div key={c.id} onClick={onDone}>
          <ConversationRow conv={c} active={false} now={new Date()} />
        </div>
      ))}
      {matchingContacts.length > 0 && <SectionLabel>Contacts</SectionLabel>}
      {matchingContacts.map((c) => (
        <PersonRow
          key={c.user.id}
          user={c.user}
          name={displayName(c.user, contacts)}
          hint={directWith.has(c.user.id) ? undefined : "Start a chat"}
          onClick={() => void openUser(c.user.id)}
        />
      ))}
      {others.length > 0 && <SectionLabel>Other people</SectionLabel>}
      {others.map((u) => (
        <PersonRow
          key={u.id}
          user={u}
          name={u.display_name}
          hint={formatPhone(u.phone)}
          onClick={() => void openUser(u.id)}
          right={
            <button
              onClick={() => void addContact({ user_id: u.id }).catch(() => toast("Could not add contact"))}
              className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent hover:opacity-80"
              aria-label={`Add ${u.display_name} to contacts`}
            >
              <UserPlus size={14} /> Add
            </button>
          }
        />
      ))}
      {empty && <p className="px-6 py-10 text-center text-secondary">No results for “{query}”</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="px-5 pt-3 pb-1 text-[13px] font-semibold text-secondary">{children}</h2>;
}

export function PersonRow({
  user,
  name,
  hint,
  onClick,
  right,
}: {
  user: User;
  name: string;
  hint?: string;
  onClick?: () => void;
  right?: React.ReactNode;
}) {
  // The side action (e.g. "Add") is a sibling of the row button: buttons can't be nested.
  return (
    <div className="mx-2.5 flex items-center gap-1 rounded-xl pr-2 hover:bg-hover">
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-left">
        <Avatar name={name} url={user.avatar_url} color={user.avatar_color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium">{name}</div>
          <div className="truncate text-[13px] text-secondary">{hint ?? user.about}</div>
        </div>
      </button>
      {right}
    </div>
  );
}
