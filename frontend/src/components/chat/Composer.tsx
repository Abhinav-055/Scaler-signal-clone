"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Plus, SendHorizontal, Smile, Sticker, X } from "lucide-react";
import { notifyTyping, sendFiles, sendText, stopTyping } from "@/lib/chatActions";
import { replySummary, senderName } from "@/lib/conversation";
import type { Conversation } from "@/lib/types";
import { useChat } from "@/store/chat";
import { useSettings } from "@/store/settings";
import { toast, useUi } from "@/store/ui";
import { IconButton } from "@/components/ui/controls";
import { EmojiPicker } from "./EmojiPicker";

const MAX_HEIGHT = 140;
/** Unsent text per conversation, so switching chats doesn't lose a draft. */
const drafts = new Map<number, string>();

export function Composer({ conv, meId }: { conv: Conversation; meId: number }) {
  const [text, setText] = useState(() => drafts.get(conv.id) ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replyTo = useUi((s) => s.replyTo[conv.id]);
  const setReplyTo = useUi((s) => s.setReplyTo);
  const contacts = useChat((s) => s.contacts);
  const enterToSend = useSettings((s) => s.enterToSend);
  const spellCheck = useSettings((s) => s.spellCheck);

  // Auto-grow the textarea up to MAX_HEIGHT, then scroll inside it.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    drafts.set(conv.id, text);
  }, [text, conv.id]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    // Focus on open, except on touch devices where it would pop the keyboard.
    if (window.matchMedia("(pointer: fine)").matches) textareaRef.current?.focus();
    return () => stopTyping(conv.id);
  }, [conv.id]);

  if (!conv.is_active_member) {
    return (
      <div className="border-t border-border px-4 py-4 text-center text-[13px] text-secondary">
        You can&apos;t send messages to this group because you&apos;re no longer a member.
      </div>
    );
  }

  function send() {
    const body = text.trim();
    if (!body) return;
    sendText(conv.id, body, replyTo);
    setText("");
    setReplyTo(conv.id, undefined);
    stopTyping(conv.id);
  }

  function attach(files: File[]) {
    if (files.length === 0) return;
    sendFiles(conv.id, files, text.trim(), replyTo);
    setText("");
    setReplyTo(conv.id, undefined);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: don't send while an IME (e.g. Hindi/Chinese input) is mid-composition.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && enterToSend) {
      e.preventDefault();
      send();
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = [...e.clipboardData.files];
    if (files.length > 0) {
      e.preventDefault();
      attach(files);
    }
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return (
    <div className="shrink-0 px-3 pt-1 pb-3 md:px-4 md:pb-4">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-input px-3 py-2">
          <div className="min-w-0 flex-1 border-l-4 border-accent pl-2">
            <div className="text-[13px] font-semibold">
              Replying to {senderName(conv, replyTo.sender_id, meId, contacts)}
            </div>
            <div className="line-clamp-2 text-[13px] text-secondary">
              {replySummary({ ...replyTo, has_attachment: replyTo.attachments.length > 0 })}
            </div>
          </div>
          <IconButton label="Cancel reply" onClick={() => setReplyTo(conv.id, undefined)} className="p-1!">
            <X size={16} />
          </IconButton>
        </div>
      )}

      {/* Signal Desktop: emoji | message pill | sticker, mic (or send), attach */}
      <div className="flex items-end gap-1 md:gap-2">
        <div className="relative">
          <IconButton label="Emoji" onClick={() => setEmojiOpen((v) => !v)} active={emojiOpen} className="text-text!">
            <Smile size={24} strokeWidth={1.7} />
          </IconButton>
          {emojiOpen && (
            <div className="absolute bottom-12 left-0 z-30">
              <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />
            </div>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          spellCheck={spellCheck}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) notifyTyping(conv.id);
            else stopTyping(conv.id);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Message"
          aria-label="Message"
          maxLength={4000}
          className="max-h-[140px] min-h-10 min-w-0 flex-1 resize-none rounded-[20px] bg-composer px-4 py-[9px] text-[15px] leading-[22px] outline-none placeholder:text-secondary"
        />

        {!text.trim() && (
          <IconButton label="Stickers" onClick={() => toast("Stickers are coming soon")} className="hidden text-text! sm:inline-flex">
            <Sticker size={22} strokeWidth={1.7} />
          </IconButton>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            attach([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />

        {text.trim() ? (
          <button
            onClick={send}
            aria-label="Send message"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent hover:bg-accent-hover"
          >
            <SendHorizontal size={19} />
          </button>
        ) : (
          <IconButton label="Voice message" onClick={() => toast("Voice messages are coming soon")} className="text-text!">
            <Mic size={22} strokeWidth={1.7} />
          </IconButton>
        )}
        <IconButton label="Attach file" onClick={() => fileRef.current?.click()} className="text-text!">
          <Plus size={24} strokeWidth={1.7} />
        </IconButton>
      </div>
    </div>
  );
}
