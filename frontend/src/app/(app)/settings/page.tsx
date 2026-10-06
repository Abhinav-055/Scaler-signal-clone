"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Camera,
  CircleHelp,
  Lock,
  MessageSquare,
  MonitorSmartphone,
  Palette,
  UserRound,
} from "lucide-react";
import { api, ApiError, DEMO_OTP } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { notificationsSupported, requestNotificationPermission, showMessageNotification } from "@/lib/notify";
import type { User } from "@/lib/types";
import { uploadToCloudinary } from "@/lib/upload";
import { useAuth } from "@/store/auth";
import { useSettings, type NotificationContent, type Theme } from "@/store/settings";
import { toast, useUi } from "@/store/ui";
import { Avatar } from "@/components/ui/Avatar";
import { Button, IconButton, Spinner, Toggle } from "@/components/ui/controls";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "devices", label: "Linked devices", icon: MonitorSmartphone },
  { id: "help", label: "Help", icon: CircleHelp },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const router = useRouter();
  const params = useSearchParams();
  const section = (params.get("section") as SectionId | null) ?? null;
  const current = SECTIONS.find((s) => s.id === section);
  const select = (id: SectionId | null) => router.replace(id ? `/settings?section=${id}` : "/settings");

  return (
    <div className="flex min-w-0 flex-1">
      {/* Section list: always visible on desktop; on phones only when no section is open */}
      <aside
        className={`${current ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-border bg-panel md:w-[280px] lg:w-[320px]`}
      >
        <h1 className="px-4 pt-4 pb-3 text-[20px] font-semibold">Settings</h1>
        <nav aria-label="Settings sections" className="overflow-y-auto px-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => select(id)}
              aria-current={(current?.id ?? "profile") === id ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] ${
                current?.id === id || (!current && id === "profile") ? "md:bg-selected" : ""
              } hover:bg-hover`}
            >
              <Icon size={20} className="text-secondary" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <section className={`${current ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-bg`}>
        <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-2 md:px-6">
          <IconButton label="Back to settings" onClick={() => select(null)} className="md:hidden">
            <ArrowLeft size={22} />
          </IconButton>
          <h2 className="text-[17px] font-semibold">{(current ?? SECTIONS[0]).label}</h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
            <SectionContent id={current?.id ?? "profile"} />
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case "profile":
      return <ProfileSection />;
    case "appearance":
      return <AppearanceSection />;
    case "chats":
      return <ChatsSection />;
    case "notifications":
      return <NotificationsSection />;
    case "privacy":
      return <PrivacySection />;
    case "devices":
      return (
        <Card>
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <MonitorSmartphone size={40} className="text-accent" />
            <p className="font-medium">Linked devices are coming soon</p>
            <p className="max-w-sm text-[13px] text-secondary">
              In Signal you link Desktop to your phone by scanning a QR code. This clone logs in with your phone number
              instead. You can be logged in on several browsers at once.
            </p>
          </div>
        </Card>
      );
    case "help":
      return <HelpSection />;
  }
}

// ------------------------------------------------------------------ building blocks

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h3 className="mb-2 px-1 text-[13px] font-semibold text-secondary">{title}</h3>}
      <div className="overflow-hidden rounded-xl border border-border bg-panel">{children}</div>
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div>{label}</div>
        {description && <div className="mt-0.5 text-[13px] text-secondary">{description}</div>}
      </div>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

function RadioGroup<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-hover">
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} className="h-4 w-4 accent-[var(--accent)]" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ sections

function ProfileSection() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user?.display_name ?? "");
  const [about, setAbout] = useState(user?.about ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!user) return null;

  async function save(patch: Record<string, unknown>, message = "Profile updated") {
    setBusy(true);
    try {
      setUser(await api<User>("/users/me", { method: "PATCH", body: patch }));
      toast(message);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function pick(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadToCloudinary(file, "avatar");
      await save({ avatar_url: up.secure_url, avatar_public_id: up.public_id }, "Photo updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const dirty = name.trim() !== user.display_name || about !== user.about || (username || null) !== user.username;

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3">
        <button onClick={() => fileRef.current?.click()} className="relative rounded-full" aria-label="Change profile photo">
          <Avatar name={user.display_name} url={user.avatar_url} color={user.avatar_color} size={96} />
          <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg bg-input">
            {uploading ? <Spinner size={14} /> : <Camera size={16} />}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {user.avatar_url && (
          <button onClick={() => void save({ avatar_url: null }, "Photo removed")} className="text-[13px] text-accent">
            Remove photo
          </button>
        )}
      </div>

      <Card title="Your profile">
        <label className="block border-b border-border px-4 py-3">
          <span className="text-[13px] text-secondary">Name</span>
          <input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full bg-transparent outline-none" />
        </label>
        <label className="block border-b border-border px-4 py-3">
          <span className="text-[13px] text-secondary">About</span>
          <input value={about} maxLength={140} onChange={(e) => setAbout(e.target.value)} placeholder="Write a few words about yourself" className="mt-1 block w-full bg-transparent outline-none placeholder:text-muted" />
        </label>
        <label className="block border-b border-border px-4 py-3">
          <span className="text-[13px] text-secondary">Username</span>
          <div className="mt-1 flex items-center">
            <span className="text-secondary">@</span>
            <input value={username} maxLength={32} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ""))} placeholder="username" className="block w-full bg-transparent outline-none placeholder:text-muted" />
          </div>
        </label>
        <div className="px-4 py-3">
          <span className="text-[13px] text-secondary">Phone number</span>
          <div className="mt-1">{formatPhone(user.phone)}</div>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => void logout()}>
          Log out
        </Button>
        <Button
          disabled={!dirty || !name.trim() || busy}
          onClick={() => void save({ display_name: name.trim(), about: about.trim(), ...(username ? { username } : {}) })}
        >
          {busy ? <Spinner size={16} /> : "Save"}
        </Button>
      </div>
    </>
  );
}

function AppearanceSection() {
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  return (
    <Card title="Theme">
      <RadioGroup<Theme>
        name="Theme"
        value={theme}
        onChange={(v) => set({ theme: v })}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
      />
    </Card>
  );
}

function ChatsSection() {
  const { enterToSend, spellCheck, set } = useSettings();
  return (
    <Card title="Chats">
      <ToggleRow label="Send with Enter" description="When off, Enter adds a new line and you send with the button." checked={enterToSend} onChange={(v) => set({ enterToSend: v })} />
      <ToggleRow label="Spell check text entered in message composition box" checked={spellCheck} onChange={(v) => set({ spellCheck: v })} />
    </Card>
  );
}

function NotificationsSection() {
  const { notificationsEnabled, notificationSound, notificationContent, set } = useSettings();
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : "unsupported"));

  async function enable(v: boolean) {
    set({ notificationsEnabled: v });
    if (v) setPermission(await requestNotificationPermission());
  }

  return (
    <>
      <Card title="Notifications">
        <ToggleRow
          label="Enable notifications"
          description={
            permission === "denied"
              ? "Your browser is blocking notifications for this site. Allow them in site settings."
              : permission === "unsupported"
                ? "This browser doesn't support desktop notifications."
                : permission === "default"
                  ? "You'll be asked to allow notifications."
                  : "Desktop notifications are allowed."
          }
          checked={notificationsEnabled}
          onChange={(v) => void enable(v)}
        />
        <ToggleRow label="Play notification sound" checked={notificationSound} onChange={(v) => set({ notificationSound: v })} />
      </Card>
      <Card title="Notification content">
        <RadioGroup<NotificationContent>
          name="Notification content"
          value={notificationContent}
          onChange={(v) => set({ notificationContent: v })}
          options={[
            { value: "name-and-message", label: "Name, content and actions" },
            { value: "name-only", label: "Name only" },
            { value: "nothing", label: "No name or content" },
          ]}
        />
      </Card>
      <Button
        variant="secondary"
        onClick={async () => {
          setPermission(await requestNotificationPermission());
          showMessageNotification("Signal", "This is what a notification looks like", () => {});
        }}
      >
        Send a test notification
      </Button>
    </>
  );
}

function PrivacySection() {
  const { readReceipts, typingIndicators, set } = useSettings();
  return (
    <Card title="Communication">
      <ToggleRow
        label="Read receipts"
        description="If read receipts are disabled, you won't be able to see read receipts from others, and they won't see when you've read their messages."
        checked={readReceipts}
        onChange={(v) => set({ readReceipts: v })}
      />
      <ToggleRow
        label="Typing indicators"
        description="If typing indicators are disabled, you won't be able to see typing indicators from others, and they won't see when you're typing."
        checked={typingIndicators}
        onChange={(v) => set({ typingIndicators: v })}
      />
    </Card>
  );
}

function HelpSection() {
  const openModal = useUi((s) => s.openModal);
  return (
    <>
      <Card title="About">
        <div className="px-4 py-3 text-[14px]">
          <p className="font-medium">Signal Clone · v1.0.0</p>
          <p className="mt-1 text-secondary">
            A Signal Desktop look-alike built with Next.js and FastAPI for an SDE assignment. Not affiliated with the
            Signal Foundation.
          </p>
        </div>
      </Card>
      <Card title="Demo notes">
        <ul className="list-disc space-y-1 px-8 py-3 text-[14px] text-secondary">
          {DEMO_OTP && <li>The login code is always {DEMO_OTP}.</li>}
          <li>End-to-end encryption is simulated; messages are stored on the server.</li>
          <li>Disappearing messages are deleted by a server task every 5 seconds.</li>
        </ul>
      </Card>
      <Button variant="secondary" onClick={() => openModal("shortcuts")}>
        Keyboard shortcuts
      </Button>
    </>
  );
}
