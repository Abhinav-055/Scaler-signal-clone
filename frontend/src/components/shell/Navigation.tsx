"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, MessageCircle, Phone, Settings } from "lucide-react";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { useSettings } from "@/store/settings";
import { isMuted } from "@/lib/conversation";
import { Avatar } from "@/components/ui/Avatar";

/** Signal's Stories icon: a phone-sized card with a second card peeking out behind it. */
function StoriesIcon({ size = 24, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden>
      <rect x="8" y="2.75" width="12" height="18.5" rx="3" />
      <path d="M5 5.5a3 3 0 0 0-1.25 2.4v8.2A3 3 0 0 0 5 18.5" />
    </svg>
  );
}

/** Chats tab: filled speech bubble when active, outline otherwise. */
function ChatsIcon({ size = 24, strokeWidth = 1.8, active }: { size?: number; strokeWidth?: number; active?: boolean }) {
  return <MessageCircle size={size} strokeWidth={strokeWidth} fill={active ? "currentColor" : "none"} />;
}

type TabIcon = (props: { size?: number; strokeWidth?: number; active?: boolean }) => React.ReactNode;

const TABS: { href: string; label: string; icon: TabIcon }[] = [
  { href: "/chats", label: "Chats", icon: ChatsIcon },
  { href: "/calls", label: "Calls", icon: ({ size, strokeWidth }) => <Phone size={size} strokeWidth={strokeWidth} /> },
  { href: "/stories", label: "Stories", icon: StoriesIcon },
];
const SETTINGS_TAB = {
  href: "/settings",
  label: "Settings",
  icon: (({ size, strokeWidth }) => <Settings size={size} strokeWidth={strokeWidth} />) as TabIcon,
};

function useUnreadTotal(): number {
  return useChat((s) =>
    Object.values(s.conversations).reduce((sum, c) => sum + (isMuted(c) ? 0 : c.unread_count), 0),
  );
}

function Badge({ count, className = "top-0 right-1" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={`absolute ${className} min-w-[18px] rounded-full bg-badge px-1 text-center text-[11px] leading-[18px] font-semibold text-white`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function RailLink({ href, label, icon: Icon, badge }: { href: string; label: string; icon: TabIcon; badge?: number }) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`relative flex h-10 w-[52px] items-center justify-center rounded-[10px] text-text transition-colors ${active ? "bg-selected" : "hover:bg-hover"}`}
    >
      <Icon size={22} strokeWidth={1.8} active={active} />
      {badge !== undefined && <Badge count={badge} />}
    </Link>
  );
}

/** Desktop/tablet: vertical rail on the far left, like Signal Desktop. */
export function NavRail() {
  const user = useAuth((s) => s.user);
  const unread = useUnreadTotal();
  const collapsed = useSettings((s) => s.listCollapsed);
  const setSettings = useSettings((s) => s.set);

  return (
    <nav aria-label="Main" className="hidden w-[76px] shrink-0 flex-col items-center gap-2 border-r border-border bg-rail pt-3 pb-4 md:flex">
      <button
        onClick={() => setSettings({ listCollapsed: !collapsed })}
        aria-label={collapsed ? "Expand chat list" : "Collapse chat list"}
        aria-pressed={collapsed}
        title={collapsed ? "Expand chat list" : "Collapse chat list"}
        className="mb-3 flex h-10 w-[52px] items-center justify-center rounded-[10px] text-text hover:bg-hover"
      >
        <Menu size={22} strokeWidth={1.8} />
      </button>
      {TABS.map((tab) => (
        <RailLink key={tab.href} {...tab} badge={tab.href === "/chats" ? unread : undefined} />
      ))}
      <div className="flex-1" />
      <RailLink {...SETTINGS_TAB} />
      {user && (
        <Link href="/settings?section=profile" aria-label="Your profile" title="Profile" className="mt-2 rounded-full">
          <Avatar name={user.display_name} url={user.avatar_url} color={user.avatar_color} size={32} />
        </Link>
      )}
    </nav>
  );
}

/** Phones: the same tabs (plus Settings) as a bottom bar. */
export function BottomTabs() {
  const pathname = usePathname();
  const unread = useUnreadTotal();

  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {[...TABS, SETTINGS_TAB].map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-medium text-text" : "text-secondary"}`}
          >
            <span
              className={`relative flex h-8 w-14 items-center justify-center rounded-full ${active ? "bg-selected" : ""}`}
            >
              <Icon size={22} strokeWidth={1.8} active={active} />
              {href === "/chats" && <Badge count={unread} className="-top-1 right-1" />}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
