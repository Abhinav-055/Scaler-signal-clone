"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { addContact, openDirectChat } from "@/lib/chatActions";
import { useUi } from "@/store/ui";
import { Modal } from "@/components/ui/Modal";
import { Button, Spinner } from "@/components/ui/controls";

const COUNTRY_CODES = ["+91", "+1", "+44", "+49", "+971", "+65", "+61", "+34"];

/** Add someone to your contacts by phone number or @username, with an optional nickname. */
export function AddContactModal() {
  const router = useRouter();
  const close = useUi((s) => s.closeModal);
  const [mode, setMode] = useState<"phone" | "username">("phone");
  const [country, setCountry] = useState("+91");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const digits = phone.replace(/\D/g, "");
  const valid = mode === "phone" ? digits.length >= 7 : /^[a-zA-Z0-9_.]{3,32}$/.test(username.replace(/^@/, ""));

  async function submit(openChat: boolean) {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const contact = await addContact(
        mode === "phone" ? { phone: `${country}${digits}` } : { username: username.replace(/^@/, "") },
        nickname.trim() || undefined,
      );
      close();
      if (openChat) router.push(`/chats/${await openDirectChat(contact.user.id)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add contact");
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-transparent px-3 py-2.5 outline-none focus:border-accent";

  return (
    <Modal
      title="Add contact"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" disabled={!valid || busy} onClick={() => void submit(false)}>
            Add
          </Button>
          <Button disabled={!valid || busy} onClick={() => void submit(true)}>
            {busy ? <Spinner size={16} /> : "Add & message"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3 px-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(true);
        }}
      >
        <div role="tablist" aria-label="Find by" className="flex rounded-lg bg-input p-1">
          {(["phone", "username"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-1.5 text-[13px] font-medium ${mode === m ? "bg-elevated shadow-sm" : "text-secondary"}`}
            >
              {m === "phone" ? "Phone number" : "Username"}
            </button>
          ))}
        </div>

        {mode === "phone" ? (
          <div className="flex gap-2">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-label="Country code"
              className="rounded-lg border border-border bg-elevated px-2"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              autoFocus
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d\s-]/g, ""))}
              placeholder="Phone number"
              aria-label="Phone number"
              className={input}
            />
          </div>
        ) : (
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@username"
            aria-label="Username"
            className={input}
          />
        )}

        <input
          value={nickname}
          maxLength={64}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Nickname (optional)"
          aria-label="Nickname"
          className={input}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <p className="text-[12px] text-secondary">
          They need a Signal account. Try a demo number like 98000 00005.
        </p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
