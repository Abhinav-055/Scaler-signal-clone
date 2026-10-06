"use client";

import { memo, useState } from "react";
import {
  Copy,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  Reply,
  RotateCcw,
  SmilePlus,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { retryMessage } from "@/lib/chatActions";
import { nameColor, replySummary, senderName } from "@/lib/conversation";
import { formatBubbleTime, formatBytes } from "@/lib/format";
import type { Attachment, ChatMessage, Conversation, Reaction } from "@/lib/types";
import { useChat } from "@/store/chat";
import { toast, useUi } from "@/store/ui";
import { Avatar } from "@/components/ui/Avatar";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { EmojiPicker, QUICK_REACTIONS } from "./EmojiPicker";
import { StatusIcon } from "./StatusIcon";

interface BubbleProps {
  msg: ChatMessage;
  conv: Conversation;
  meId: number;
  firstInRun: boolean;
  lastInRun: boolean;
  highlighted: boolean;
  now: Date;
  onJumpTo: (messageId: number) => void;
  onOpenImage: (url: string, name: string) => void;
  onInfo: (msg: ChatMessage) => void;
}

function MessageBubbleInner(props: BubbleProps) {
  const { msg, conv, meId, firstInRun, lastInRun, highlighted, now } = props;
  const contacts = useChat((s) => s.contacts);
  const setReplyTo = useUi((s) => s.setReplyTo);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [reactBar, setReactBar] = useState(false);
  const [picker, setPicker] = useState(false);

  const outgoing = msg.sender_id === meId;
  const isGroup = conv.type === "group";
  const canInteract = !msg.pending && conv.is_active_member;
  const sender = conv.members.find((m) => m.user.id === msg.sender_id)?.user;
  const myReaction = msg.reactions.find((r) => r.user_id === meId)?.emoji;

  // ---- actions
  async function react(emoji: string) {
    setReactBar(false);
    setPicker(false);
    const { applyReactions } = useChat.getState();
    const others = msg.reactions.filter((r) => r.user_id !== meId);
    const removing = myReaction === emoji;
    // Optimistic; the server broadcast (reaction.updated) is the source of truth.
    applyReactions(conv.id, msg.id, removing ? others : [...others, { user_id: meId, emoji }]);
    try {
      const reactions = await api<Reaction[]>(`/messages/${msg.id}/reactions`, {
        method: removing ? "DELETE" : "PUT",
        body: removing ? undefined : { emoji },
      });
      applyReactions(conv.id, msg.id, reactions);
    } catch {
      applyReactions(conv.id, msg.id, msg.reactions);
      toast("Could not update reaction");
    }
  }

  async function deleteForMe() {
    try {
      if (!msg.pending) await api(`/messages/${msg.id}`, { method: "DELETE" });
      useChat.getState().removeMessages(conv.id, [msg.id]);
      if (msg.pending) useChat.getState().clearOutbox(msg.client_id);
      if (conv.last_message?.id === msg.id) void useChat.getState().fetchConversation(conv.id);
      toast("Message deleted for you");
    } catch {
      toast("Could not delete message");
    }
  }

  const menuItems: MenuItem[] = [];
  if (msg.status === "failed") menuItems.push({ label: "Retry", icon: <RotateCcw size={16} />, onSelect: () => retryMessage(msg) });
  if (canInteract) {
    menuItems.push({ label: "Reply", icon: <Reply size={16} />, onSelect: () => setReplyTo(conv.id, msg) });
    menuItems.push({ label: "React", icon: <SmilePlus size={16} />, onSelect: () => setReactBar(true) });
  }
  if (msg.body) {
    menuItems.push({
      label: "Copy text",
      icon: <Copy size={16} />,
      onSelect: () =>
        void navigator.clipboard.writeText(msg.body).then(
          () => toast("Copied to clipboard"),
          () => toast("Could not copy"),
        ),
    });
  }
  if (outgoing && !msg.pending) menuItems.push({ label: "Message info", icon: <Info size={16} />, onSelect: () => props.onInfo(msg) });
  menuItems.push({ label: "Delete for me", icon: <Trash2 size={16} />, onSelect: () => void deleteForMe(), danger: true });

  // ---- system messages: centered grey line with an icon for the kind of change
  if (msg.type === "system") {
    return (
      <div id={`msg-${msg.id}`} className="flex justify-center px-6 py-3">
        <p className="flex max-w-md items-start gap-2 text-center text-[14px] leading-5 text-secondary">
          <SystemIcon body={msg.body} />
          <span>{msg.body}</span>
        </p>
      </div>
    );
  }

  // Tighter corners on the sender's side inside a run of consecutive messages.
  const corners = outgoing
    ? `${firstInRun ? "" : "rounded-tr-[4px]"} ${lastInRun ? "" : "rounded-br-[4px]"}`
    : `${firstInRun ? "" : "rounded-tl-[4px]"} ${lastInRun ? "" : "rounded-bl-[4px]"}`;
  const colors = outgoing ? "bg-bubble-out text-bubble-out-text" : "bg-bubble-in text-bubble-in-text";
  const metaColor = outgoing ? "text-bubble-out-meta" : "text-secondary";
  const imageOnly = msg.type === "image" && !msg.body && !msg.reply_to;

  const meta = (
    <span
      className={`ml-2.5 inline-flex translate-y-[4px] items-center gap-1 align-bottom text-[12px] whitespace-nowrap ${
        imageOnly ? "rounded-full bg-black/45 px-1.5 py-0.5 text-white" : metaColor
      } float-right`}
    >
      {formatBubbleTime(msg.created_at, now)}
      {msg.expires_at && <Timer size={13} aria-label="Disappearing message" />}
      {outgoing && msg.status && <StatusIcon status={msg.status} />}
    </span>
  );

  // Group reactions into pills: emoji -> count
  const reactionCounts = msg.reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  const hoverActions = canInteract && (
    <div
      className={`flex shrink-0 items-center self-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 ${outgoing ? "flex-row-reverse" : ""} ${reactBar || picker || menu ? "opacity-100" : ""}`}
    >
      <button onClick={() => setReactBar((v) => !v)} className="rounded-full p-1.5 text-secondary hover:bg-hover" aria-label="React">
        <SmilePlus size={17} />
      </button>
      <button onClick={() => setReplyTo(conv.id, msg)} className="rounded-full p-1.5 text-secondary hover:bg-hover" aria-label="Reply">
        <Reply size={17} />
      </button>
      <button
        onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
        className="rounded-full p-1.5 text-secondary hover:bg-hover"
        aria-label="More actions"
      >
        <MoreHorizontal size={17} />
      </button>
    </div>
  );

  return (
    <div
      id={`msg-${msg.id}`}
      className={`group flex items-end px-3 md:px-5 ${lastInRun ? "pb-3" : "pb-0.5"} ${highlighted ? "msg-highlight" : ""} ${outgoing ? "justify-end" : "justify-start"}`}
    >
      {/* Group chats: avatar beside the last message of a run, a spacer for the rest */}
      {isGroup && !outgoing && (
        <div className={`mr-2 w-7 shrink-0 ${msg.reactions.length > 0 ? "mb-5" : ""}`}>
          {lastInRun && sender && (
            <Avatar name={sender.display_name} url={sender.avatar_url} color={sender.avatar_color} size={28} />
          )}
        </div>
      )}

      <div className={`flex max-w-[85%] min-w-0 items-end gap-1 md:max-w-[70%] ${outgoing ? "flex-row-reverse" : ""}`}>
        <div className="relative min-w-0">
          <div
            tabIndex={0}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY });
            }}
            aria-label={`Message from ${outgoing ? "you" : (sender?.display_name ?? "unknown")}`}
            className={`min-w-0 overflow-hidden rounded-[18px] ${corners} ${colors} ${imageOnly ? "" : "px-3 py-2"} ${msg.status === "failed" ? "opacity-70" : ""}`}
          >
            {isGroup && !outgoing && firstInRun && (
              <div className={`mb-0.5 text-[14px] font-semibold ${imageOnly ? "px-3 pt-2" : ""}`} style={{ color: nameColor(msg.sender_id) }}>
                {senderName(conv, msg.sender_id, meId, contacts)}
              </div>
            )}

            {msg.reply_to && (
              <button
                onClick={() => props.onJumpTo(msg.reply_to!.id)}
                className={`mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-[13px] ${
                  outgoing ? "border-white/80 bg-white/20" : "border-accent bg-black/5 dark:bg-white/10"
                }`}
              >
                <div className="font-semibold">{senderName(conv, msg.reply_to.sender_id, meId, contacts)}</div>
                <div className="line-clamp-2 opacity-90">{replySummary(msg.reply_to)}</div>
              </button>
            )}

            <Attachments
              msg={msg}
              imageOnly={imageOnly}
              flushTop={!msg.reply_to && !(isGroup && !outgoing && firstInRun)}
              onOpenImage={props.onOpenImage}
              outgoing={outgoing}
            />

            {msg.body || !imageOnly ? (
              <div className="text-[15px] leading-[21px] wrap-break-word whitespace-pre-wrap">
                {msg.body}
                {meta}
              </div>
            ) : (
              <div className="pointer-events-none absolute right-2 bottom-2">{meta}</div>
            )}
          </div>

          {msg.status === "failed" && (
            <button onClick={() => retryMessage(msg)} className="mt-1 flex items-center gap-1 text-[12px] text-danger">
              <RotateCcw size={12} /> {msg.error ?? "Not sent"} · Tap to retry
            </button>
          )}

          {Object.keys(reactionCounts).length > 0 && (
            <div className={`-mt-1.5 flex flex-wrap gap-1 ${outgoing ? "justify-end pr-2" : "pl-2"}`}>
              {Object.entries(reactionCounts).map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => canInteract && void react(emoji)}
                  aria-label={`${emoji} ${count}`}
                  className={`relative flex items-center gap-1 rounded-full border-2 border-bg px-1.5 text-[13px] leading-5 ${
                    myReaction === emoji ? "bg-accent-soft" : "bg-bubble-in"
                  }`}
                >
                  {emoji}
                  {count > 1 && <span className="text-[11px] text-secondary">{count}</span>}
                </button>
              ))}
            </div>
          )}

          {reactBar && (
            <div className={`absolute -top-12 z-20 flex items-center gap-0.5 rounded-full border border-border bg-elevated p-1 shadow-pop ${outgoing ? "right-0" : "left-0"}`}>
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => void react(emoji)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[20px] transition-transform hover:scale-110 ${myReaction === emoji ? "bg-selected" : ""}`}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              <button
                onClick={() => {
                  setReactBar(false);
                  setPicker(true);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-input text-secondary"
                aria-label="More reactions"
              >
                <Plus size={18} />
              </button>
            </div>
          )}
          {picker && (
            <div className={`absolute bottom-full z-20 mb-2 ${outgoing ? "right-0" : "left-0"}`}>
              <EmojiPicker onPick={(e) => void react(e)} onClose={() => setPicker(false)} />
            </div>
          )}
        </div>
        {hoverActions}
      </div>

      {menu && <Menu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {reactBar && <div className="fixed inset-0 z-10" onClick={() => setReactBar(false)} />}
    </div>
  );
}

/**
 * Files are downloaded through a short-lived signed link from our API rather than the public
 * Cloudinary URL: Cloudinary blocks public PDF/ZIP delivery by default, and the API also
 * checks that you're a member of the conversation.
 */
async function downloadAttachment(attachmentId: number): Promise<void> {
  try {
    const { url } = await api<{ url: string }>(`/attachments/${attachmentId}/download`);
    // The signed link responds with "Content-Disposition: attachment", so this saves the file
    // without navigating away from the chat.
    window.location.href = url;
  } catch {
    toast("Could not download the file");
  }
}

/** Signal's file icon: a white page with a folded corner and the extension written on it. */
export function FileIcon({ fileName }: { fileName: string }) {
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.slice(0, 4).toUpperCase() : "";
  return (
    <svg width="30" height="38" viewBox="0 0 30 38" className="shrink-0" aria-hidden>
      <path d="M3 0h17l10 10v25a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3z" fill="#ffffff" />
      <path d="M20 0v7a3 3 0 0 0 3 3h7z" fill="#dcdcdc" />
      <text x="15" y="28" textAnchor="middle" fontSize={ext.length > 3 ? 7 : 8.5} fontWeight="700" fill="#1b1b1b" fontFamily="inherit">
        {ext}
      </text>
    </svg>
  );
}

function FileCard({ attachment: a }: { attachment: Attachment; outgoing: boolean }) {
  const content = (
    <>
      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
        <FileIcon fileName={a.file_name} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5">{a.file_name}</span>
        <span className="text-[13px] opacity-80">{formatBytes(a.size_bytes)}</span>
      </span>
    </>
  );
  const className = "mt-0.5 mb-1 flex max-w-[280px] min-w-[200px] items-center gap-3 text-left hover:opacity-90";

  // Files uploaded through the app live in our Cloudinary folder: download via a signed link.
  if (a.public_id.startsWith("signal-clone/")) {
    return (
      <button onClick={() => void downloadAttachment(a.id)} aria-label={`Download ${a.file_name}`} className={className}>
        {content}
      </button>
    );
  }
  // Anything else (e.g. seeded demo files hosted elsewhere) is a plain link in a new tab.
  return (
    <a href={a.secure_url} target="_blank" rel="noreferrer" download={a.file_name} className={className}>
      {content}
    </a>
  );
}

function Attachments({
  msg,
  imageOnly,
  flushTop,
  outgoing,
  onOpenImage,
}: {
  msg: ChatMessage;
  imageOnly: boolean;
  /** Image touches the bubble top edge (no sender name or quote above it). */
  flushTop: boolean;
  outgoing: boolean;
  onOpenImage: (url: string, name: string) => void;
}) {
  // Captioned images bleed to the bubble edges; image-only bubbles are just the image.
  const edge = imageOnly ? "" : flushTop ? "-mx-3 -mt-[7px] mb-1.5" : "-mx-3 mb-1.5";
  // Optimistic message still uploading: show the local preview with progress.
  if (msg.uploads?.length) {
    const up = msg.uploads[0];
    const pct = Math.round(up.progress * 100);
    if (up.previewUrl) {
      return (
        <div className={`relative ${edge}`}>
          {up.mimeType.startsWith("video/") ? (
            <video src={up.previewUrl} muted className="block max-h-[320px] w-[300px] max-w-full bg-black object-cover opacity-70" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={up.previewUrl} alt={up.name} className="block max-h-[320px] w-[300px] max-w-full object-cover opacity-70" />
          )}
          {msg.status !== "failed" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium text-white">{pct}%</span>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="mb-1 flex min-w-[220px] items-center gap-3">
        <FileIcon fileName={up.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{up.name}</div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/20">
            <div className="h-full bg-current transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {msg.attachments.map((a) =>
        a.resource_type === "video" ? (
          <video
            key={a.id}
            src={a.secure_url}
            controls
            preload="metadata"
            playsInline
            aria-label={`Video ${a.file_name}`}
            className={`block max-h-[360px] w-[300px] max-w-full bg-black ${edge}`}
            style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
          />
        ) : a.resource_type === "image" ? (
          <button
            key={a.id}
            onClick={() => onOpenImage(a.secure_url, a.file_name)}
            className={`block ${edge}`}
            aria-label={`Open image ${a.file_name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.secure_url}
              alt={a.file_name}
              loading="lazy"
              width={a.width ?? undefined}
              height={a.height ?? undefined}
              className="block h-auto max-h-[320px] w-[300px] max-w-full object-cover"
              style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
            />
          </button>
        ) : (
          <FileCard key={a.id} attachment={a} outgoing={outgoing} />
        ),
      )}
    </>
  );
}

/** Icon for a system message, picked from its wording (the server sends plain text). */
function SystemIcon({ body }: { body: string }) {
  const text = body.toLowerCase();
  const props = { size: 17, strokeWidth: 1.8, className: "mt-px shrink-0", "aria-hidden": true };
  if (text.includes("disappearing")) return <Timer {...props} />;
  if (text.includes(" added ") || text.includes("joined")) return <UserPlus {...props} />;
  if (text.includes("removed") || text.includes(" left")) return <UserMinus {...props} />;
  if (text.includes("changed") || text.includes("renamed") || text.includes("updated")) return <Pencil {...props} />;
  return <Users {...props} />;
}

export const MessageBubble = memo(MessageBubbleInner);
