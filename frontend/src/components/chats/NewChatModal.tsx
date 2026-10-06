"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Phone, Search, UserPlus, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { openDirectChat } from "@/lib/chatActions";
import { displayName } from "@/lib/conversation";
import type { Contact } from "@/lib/types";
import { useChat } from "@/store/chat";
import { toast, useUi } from "@/store/ui";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/controls";
import { PersonRow } from "./ConversationList";

/** "New chat": pick a contact, start a group, or find someone by phone number / username. */
export function NewChatModal() {
  const router = useRouter();
  const close = useUi((s) => s.closeModal);
  const openModal = useUi((s) => s.openModal);
  const contacts = useChat((s) => s.contacts);
  const loadContacts = useChat((s) => s.loadContacts);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const q = query.trim();
  const digits = q.replace(/[\s-]/g, "");
  const looksLikePhone = /^\+?\d{7,15}$/.test(digits);
  const looksLikeUsername = /^@?[a-zA-Z0-9_.]{3,32}$/.test(q) && !looksLikePhone;

  const sorted = [...contacts]
    .sort((a, b) => displayName(a.user, contacts).localeCompare(displayName(b.user, contacts)))
    .filter((c) => !q || displayName(c.user, contacts).toLowerCase().includes(q.toLowerCase()));

  async function start(userId: number) {
    setBusy(true);
    try {
      const id = await openDirectChat(userId);
      close();
      router.push(`/chats/${id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not start the chat");
      setBusy(false);
    }
  }

  async function findAndAdd() {
    setBusy(true);
    try {
      const body = looksLikePhone
        ? { phone: digits.startsWith("+") ? digits : `+91${digits}` }
        : { username: q.replace(/^@/, "") };
      const contact = await api<Contact>("/contacts", { method: "POST", body });
      await loadContacts();
      toast(`${contact.user.display_name} added to contacts`);
      await start(contact.user.id);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "No Signal user found");
      setBusy(false);
    }
  }

  return (
    <Modal title="New chat" onClose={close}>
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-input px-2.5">
          <Search size={16} className="text-secondary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, username or number"
            aria-label="Name, username or phone number"
            className="h-9 min-w-0 flex-1 bg-transparent outline-none placeholder:text-secondary"
          />
          {busy && <Spinner size={16} className="text-secondary" />}
        </div>
      </div>

      <div className="pb-3">
        {!q && (
          <button
            onClick={() => openModal("newGroup")}
            className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Users size={20} />
            </span>
            <span className="text-[15px] font-medium">New group</span>
          </button>
        )}
        {!q && (
          <button
            onClick={() => openModal("addContact")}
            className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <UserPlus size={20} />
            </span>
            <span className="text-[15px] font-medium">Add contact</span>
          </button>
        )}

        {(looksLikePhone || looksLikeUsername) && (
          <button
            disabled={busy}
            onClick={() => void findAndAdd()}
            className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-input">
              {looksLikePhone ? <Phone size={18} /> : <AtSign size={18} />}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[15px] font-medium">{q}</span>
              <span className="text-[13px] text-secondary">
                {looksLikePhone ? "Find by phone number" : "Find by username"}
              </span>
            </span>
          </button>
        )}

        <h3 className="px-5 pt-3 pb-1 text-[13px] font-semibold text-secondary">Contacts</h3>
        {sorted.map((c) => (
          <PersonRow
            key={c.user.id}
            user={c.user}
            name={displayName(c.user, contacts)}
            onClick={() => void start(c.user.id)}
          />
        ))}
        {sorted.length === 0 && (
          <p className="px-5 py-4 text-[13px] text-secondary">
            {q ? "No contacts match. Try a full phone number or @username." : "No contacts yet."}
          </p>
        )}
      </div>
    </Modal>
  );
}
