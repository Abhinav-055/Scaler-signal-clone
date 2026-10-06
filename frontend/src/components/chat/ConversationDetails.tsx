"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  BellOff,
  Camera,
  LogOut,
  MessageCircle,
  Pencil,
  ShieldCheck,
  Timer,
  UserMinus,
  UserPlus,
  UserCog,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { addContact, openDirectChat, removeContact } from "@/lib/chatActions";
import { conversationAvatar, conversationTitle, displayName, isMuted, otherMember } from "@/lib/conversation";
import { DISAPPEARING_OPTIONS, formatPhone } from "@/lib/format";
import type { Conversation, Member, User } from "@/lib/types";
import { uploadToCloudinary } from "@/lib/upload";
import { useChat } from "@/store/chat";
import { toast } from "@/store/ui";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton, Spinner, Toggle } from "@/components/ui/controls";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { Modal } from "@/components/ui/Modal";
import { MemberPicker } from "@/components/chats/NewGroupModal";
import { useNow } from "@/hooks/useNow";
import { updateConversation } from "./ChatHeader";

const MUTE_OPTIONS = [
  { label: "Not muted", ms: 0 },
  { label: "1 hour", ms: 3_600_000 },
  { label: "8 hours", ms: 8 * 3_600_000 },
  { label: "1 day", ms: 86_400_000 },
  { label: "1 week", ms: 7 * 86_400_000 },
  { label: "Always", ms: -1 },
];

interface Props {
  conv: Conversation;
  meId: number;
  onClose: () => void;
  onSafetyNumber: () => void;
}

/** Signal's "conversation details" panel: profile, settings, members, leave. */
export function ConversationDetails({ conv, meId, onClose, onSafetyNumber }: Props) {
  const router = useRouter();
  const contacts = useChat((s) => s.contacts);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [memberMenu, setMemberMenu] = useState<{ member: Member; x: number; y: number } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const now = useNow();

  const isGroup = conv.type === "group";
  const isAdmin = conv.my_role === "admin" && conv.is_active_member;
  const peer = isGroup ? undefined : otherMember(conv, meId)?.user;
  const activeMembers = conv.members
    .filter((m) => !m.left_at)
    .sort((a, b) => (a.user.id === meId ? -1 : b.user.id === meId ? 1 : a.user.display_name.localeCompare(b.user.display_name)));
  const canChangeTimer = conv.is_active_member && (!isGroup || isAdmin);

  async function memberAction(path: string, method: string, body?: unknown, success?: string) {
    try {
      const updated = await api<Conversation>(path, { method, body });
      useChat.getState().upsertConversation(updated);
      if (success) toast(success);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Something went wrong");
    }
  }

  function openMemberMenu(member: Member, e: React.MouseEvent) {
    if (member.user.id === meId) return;
    setMemberMenu({ member, x: e.clientX, y: e.clientY });
  }

  const memberItems = (member: Member): MenuItem[] => {
    const items: MenuItem[] = [
      {
        label: `Message ${member.user.display_name.split(" ")[0]}`,
        icon: <MessageCircle size={16} />,
        onSelect: () => void openDirectChat(member.user.id).then((id) => router.push(`/chats/${id}`)),
      },
    ];
    if (isAdmin) {
      items.push({
        label: member.role === "admin" ? "Remove as admin" : "Make admin",
        icon: <UserCog size={16} />,
        onSelect: () =>
          void memberAction(`/conversations/${conv.id}/members/${member.user.id}`, "PATCH", {
            role: member.role === "admin" ? "member" : "admin",
          }),
      });
      items.push({
        label: "Remove from group",
        icon: <UserMinus size={16} />,
        danger: true,
        onSelect: () =>
          void memberAction(
            `/conversations/${conv.id}/members/${member.user.id}`,
            "DELETE",
            undefined,
            `${member.user.display_name} removed`,
          ),
      });
    }
    return items;
  };

  // Which dropdown option matches muted_until (anything over a year away counts as "Always").
  const mutedFor = conv.muted_until ? Date.parse(conv.muted_until) - now.getTime() : 0;
  const muteValue = !isMuted(conv)
    ? 0
    : mutedFor > 365 * 86_400_000
      ? -1
      : (MUTE_OPTIONS.find((o) => o.ms > 0 && mutedFor <= o.ms)?.ms ?? -1);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-2 md:px-4">
        <IconButton label="Back to chat" onClick={onClose}>
          <ArrowLeft size={22} />
        </IconButton>
        <h2 className="text-[16px] font-semibold">{isGroup ? "Group settings" : "Chat settings"}</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 pb-10">
          {/* Profile */}
          <div className="flex flex-col items-center pt-8 pb-6 text-center">
            <Avatar {...conversationAvatar(conv, meId, contacts)} size={96} />
            <h3 className="mt-3 flex items-center gap-2 text-[22px] font-semibold">
              {conversationTitle(conv, meId, contacts)}
              {isAdmin && (
                <IconButton label="Edit group" onClick={() => setEditing(true)} className="p-1!">
                  <Pencil size={16} />
                </IconButton>
              )}
            </h3>
            {peer ? (
              <>
                <p className="mt-1 text-secondary">{formatPhone(peer.phone)}</p>
                {peer.username && <p className="text-secondary">@{peer.username}</p>}
                {peer.about && <p className="mt-2 max-w-sm text-[14px]">{peer.about}</p>}
              </>
            ) : (
              <>
                <p className="mt-1 text-secondary">Group · {activeMembers.length} members</p>
                {conv.description && <p className="mt-2 max-w-sm text-[14px] whitespace-pre-wrap">{conv.description}</p>}
              </>
            )}
            {!conv.is_active_member && (
              <p className="mt-3 rounded-lg bg-input px-3 py-2 text-[13px] text-secondary">You are no longer a member of this group.</p>
            )}
          </div>

          {/* Settings rows */}
          <section className="overflow-hidden rounded-xl border border-border">
            <Row icon={<Timer size={18} />} label="Disappearing messages" hint={!canChangeTimer && isGroup ? "Only admins can change this" : undefined}>
              <select
                value={conv.disappearing_seconds ?? ""}
                disabled={!canChangeTimer}
                aria-label="Disappearing message timer"
                onChange={(e) => void updateConversation(conv, { disappearing_seconds: e.target.value ? Number(e.target.value) : null })}
                className="rounded-md border border-border bg-panel px-2 py-1 text-[13px] disabled:opacity-60"
              >
                {DISAPPEARING_OPTIONS.map((o) => (
                  <option key={o.label} value={o.seconds ?? ""}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row icon={<BellOff size={18} />} label="Mute notifications">
              <select
                value={muteValue}
                aria-label="Mute notifications"
                onChange={(e) => {
                  const ms = Number(e.target.value);
                  const until = ms === 0 ? null : ms === -1 ? "9999-12-31T00:00:00Z" : new Date(Date.now() + ms).toISOString();
                  void updateConversation(conv, { muted_until: until });
                }}
                className="rounded-md border border-border bg-panel px-2 py-1 text-[13px]"
              >
                {MUTE_OPTIONS.map((o) => (
                  <option key={o.label} value={o.ms}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row icon={<Archive size={18} />} label="Archive chat">
              <Toggle label="Archive chat" checked={conv.archived} onChange={(v) => void updateConversation(conv, { archived: v })} />
            </Row>
            {peer &&
              (contacts.some((c) => c.user.id === peer.id) ? (
                <button
                  onClick={() => void removeContact(peer.id, peer.display_name)}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-hover"
                >
                  <UserMinus size={18} className="text-secondary" />
                  <span className="flex-1">Remove from contacts</span>
                </button>
              ) : (
                <button
                  onClick={() => void addContact({ user_id: peer.id }).catch(() => toast("Could not add contact"))}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-accent hover:bg-hover"
                >
                  <UserPlus size={18} />
                  <span className="flex-1">Add to contacts</span>
                </button>
              ))}
            {peer && (
              <button onClick={onSafetyNumber} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
                <ShieldCheck size={18} className="text-secondary" />
                <span className="flex-1">View safety number</span>
              </button>
            )}
          </section>

          {/* Members */}
          {isGroup && (
            <section className="mt-6">
              <h4 className="mb-2 px-1 text-[13px] font-semibold text-secondary">{activeMembers.length} members</h4>
              <div className="overflow-hidden rounded-xl border border-border">
                {isAdmin && (
                  <button onClick={() => setAdding(true)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <UserPlus size={18} />
                    </span>
                    Add members
                  </button>
                )}
                {activeMembers.map((m) => (
                  <button
                    key={m.user.id}
                    onClick={(e) => openMemberMenu(m, e)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMemberMenu(m, e);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover"
                    aria-label={m.user.id === meId ? "You" : `${m.user.display_name}, open member options`}
                  >
                    <Avatar name={m.user.display_name} url={m.user.avatar_url} color={m.user.avatar_color} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.user.id === meId ? "You" : displayName(m.user, contacts)}</span>
                      <span className="block truncate text-[12px] text-secondary">{m.user.about}</span>
                    </span>
                    {m.role === "admin" && <span className="rounded-full bg-input px-2 py-0.5 text-[11px] font-medium text-secondary">Admin</span>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {isGroup && conv.is_active_member && (
            <button
              onClick={() => setConfirmLeave(true)}
              className="mt-6 flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left text-danger hover:bg-hover"
            >
              <LogOut size={18} /> Leave group
            </button>
          )}
        </div>
      </div>

      {memberMenu && (
        <Menu x={memberMenu.x} y={memberMenu.y} items={memberItems(memberMenu.member)} onClose={() => setMemberMenu(null)} />
      )}
      {editing && <EditGroupModal conv={conv} onClose={() => setEditing(false)} />}
      {adding && (
        <AddMembersModal
          conv={conv}
          onClose={() => setAdding(false)}
          onAdd={(users) =>
            void memberAction(`/conversations/${conv.id}/members`, "POST", { user_ids: users.map((u) => u.id) }, "Members added").then(
              () => setAdding(false),
            )
          }
        />
      )}
      {confirmLeave && (
        <Modal
          title="Leave group?"
          onClose={() => setConfirmLeave(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmLeave(false);
                  void memberAction(`/conversations/${conv.id}/members/${meId}`, "DELETE", undefined, "You left the group");
                }}
              >
                Leave
              </Button>
            </>
          }
        >
          <p className="px-4 pb-2 text-secondary">You will no longer be able to send or receive messages in this group.</p>
        </Modal>
      )}
    </div>
  );
}

function Row({ icon, label, hint, children }: { icon: React.ReactNode; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className="text-secondary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-[12px] text-secondary">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function AddMembersModal({ conv, onClose, onAdd }: { conv: Conversation; onClose: () => void; onAdd: (users: User[]) => void }) {
  const [selected, setSelected] = useState<User[]>([]);
  const exclude = conv.members.filter((m) => !m.left_at).map((m) => m.user.id);
  return (
    <Modal
      title="Add members"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={selected.length === 0} onClick={() => onAdd(selected)}>
            Add {selected.length > 0 ? selected.length : ""}
          </Button>
        </>
      }
    >
      <MemberPicker
        selected={selected}
        exclude={exclude}
        onToggle={(u) => setSelected((cur) => (cur.some((x) => x.id === u.id) ? cur.filter((x) => x.id !== u.id) : [...cur, u]))}
      />
    </Modal>
  );
}

function EditGroupModal({ conv, onClose }: { conv: Conversation; onClose: () => void }) {
  const [name, setName] = useState(conv.name ?? "");
  const [description, setDescription] = useState(conv.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState(conv.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file?: File) {
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

  async function save() {
    setBusy(true);
    const patch: Record<string, unknown> = {};
    if (name.trim() && name.trim() !== conv.name) patch.name = name.trim();
    if (description.trim() !== (conv.description ?? "")) patch.description = description.trim();
    if (avatarUrl !== conv.avatar_url) patch.avatar_url = avatarUrl;
    if (Object.keys(patch).length) await updateConversation(conv, patch);
    onClose();
  }

  return (
    <Modal
      title="Edit group"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || busy || uploading} onClick={() => void save()}>
            {busy ? <Spinner size={16} /> : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 px-6 pt-2 pb-4">
        <button onClick={() => fileRef.current?.click()} className="relative rounded-full" aria-label="Change group photo">
          <Avatar name={name} url={avatarUrl} color="blue" size={80} group={!avatarUrl} />
          <span className="absolute right-0 bottom-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-elevated bg-input">
            {uploading ? <Spinner size={12} /> : <Camera size={14} />}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <input
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          aria-label="Group name"
          placeholder="Group name"
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 outline-none focus:border-accent"
        />
        <textarea
          value={description}
          maxLength={280}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Group description"
          placeholder="Group description"
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 outline-none focus:border-accent"
        />
      </div>
    </Modal>
  );
}
