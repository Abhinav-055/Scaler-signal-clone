"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Search, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { displayName } from "@/lib/conversation";
import type { Conversation, User } from "@/lib/types";
import { uploadToCloudinary } from "@/lib/upload";
import { useChat } from "@/store/chat";
import { toast, useUi } from "@/store/ui";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton, Spinner } from "@/components/ui/controls";

/** Shared member picker: used for "New group" and "Add members". */
export function MemberPicker({
  selected,
  onToggle,
  exclude = [],
}: {
  selected: User[];
  onToggle: (user: User) => void;
  exclude?: number[];
}) {
  const contacts = useChat((s) => s.contacts);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = [...contacts]
    .filter((c) => !exclude.includes(c.user.id))
    .filter((c) => !q || displayName(c.user, contacts).toLowerCase().includes(q))
    .sort((a, b) => displayName(a.user, contacts).localeCompare(displayName(b.user, contacts)));

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {selected.map((u) => (
            <button
              key={u.id}
              onClick={() => onToggle(u)}
              className="flex items-center gap-1.5 rounded-full bg-input py-0.5 pr-2 pl-0.5 text-[13px]"
              aria-label={`Remove ${u.display_name}`}
            >
              <Avatar name={u.display_name} url={u.avatar_url} color={u.avatar_color} size={22} />
              {u.display_name.split(" ")[0]}
              <X size={14} />
            </button>
          ))}
        </div>
      )}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-input px-2.5">
          <Search size={16} className="text-secondary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts"
            aria-label="Search contacts"
            className="h-9 min-w-0 flex-1 bg-transparent outline-none placeholder:text-secondary"
          />
        </div>
      </div>
      <ul className="pb-2">
        {list.map((c) => {
          const checked = selected.some((u) => u.id === c.user.id);
          return (
            <li key={c.user.id}>
              <button
                role="checkbox"
                aria-checked={checked}
                onClick={() => onToggle(c.user)}
                className="mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-hover"
              >
                <Avatar name={c.user.display_name} url={c.user.avatar_url} color={c.user.avatar_color} size={40} />
                <span className="min-w-0 flex-1 truncate text-[15px]">{displayName(c.user, contacts)}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${checked ? "border-accent bg-accent text-white" : "border-muted"}`}
                >
                  {checked && <Check size={12} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-5 py-4 text-[13px] text-secondary">No contacts found.</li>}
      </ul>
    </div>
  );
}

export function NewGroupModal() {
  const router = useRouter();
  const close = useUi((s) => s.closeModal);
  const upsertConversation = useChat((s) => s.upsertConversation);
  const [step, setStep] = useState<"members" | "details">("members");
  const [selected, setSelected] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const toggle = (user: User) =>
    setSelected((cur) => (cur.some((u) => u.id === user.id) ? cur.filter((u) => u.id !== user.id) : [...cur, user]));

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setAvatarUrl((await uploadToCloudinary(file, "avatar")).secure_url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const conv = await api<Conversation>("/conversations", {
        method: "POST",
        body: { type: "group", name: name.trim(), member_ids: selected.map((u) => u.id), avatar_url: avatarUrl },
      });
      upsertConversation(conv);
      close();
      router.push(`/chats/${conv.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not create the group");
      setBusy(false);
    }
  }

  if (step === "members") {
    return (
      <Modal
        title="Add members"
        onClose={close}
        footer={
          <>
            <span className="mr-auto self-center text-[13px] text-secondary">{selected.length} selected</span>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button disabled={selected.length === 0} onClick={() => setStep("details")}>
              Next
            </Button>
          </>
        }
      >
        <MemberPicker selected={selected} onToggle={toggle} />
      </Modal>
    );
  }

  return (
    <Modal
      title="Name this group"
      onClose={close}
      headerLeft={
        <IconButton label="Back" onClick={() => setStep("members")} className="-ml-2">
          <ArrowLeft size={20} />
        </IconButton>
      }
      footer={
        <Button disabled={!name.trim() || busy || uploading} onClick={() => void create()}>
          {busy ? <Spinner size={16} /> : "Create"}
        </Button>
      }
    >
      <div className="flex flex-col items-center px-6 pt-4 pb-6">
        <button
          onClick={() => fileInput.current?.click()}
          className="relative rounded-full"
          aria-label="Choose group photo"
        >
          <Avatar name={name} url={avatarUrl} color="blue" size={88} group={!avatarUrl} />
          <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-elevated bg-input">
            {uploading ? <Spinner size={14} /> : <Camera size={16} />}
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void pickPhoto(e.target.files?.[0])}
        />
        <input
          autoFocus
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void create()}
          placeholder="Group name (required)"
          aria-label="Group name"
          className="mt-6 w-full rounded-lg border border-border bg-transparent px-3 py-2.5 outline-none focus:border-accent"
        />
        <div className="mt-5 w-full">
          <p className="mb-2 text-[13px] font-semibold text-secondary">Members · {selected.length + 1}</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((u) => (
              <span key={u.id} className="flex items-center gap-1.5 text-[13px]">
                <Avatar name={u.display_name} url={u.avatar_url} color={u.avatar_color} size={24} />
                {u.display_name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
