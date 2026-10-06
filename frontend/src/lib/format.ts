// Date, size and name formatting helpers.

const MINUTE = 60_000;
const DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Conversation list: "Now", "5m", "14:02", "Mon", "Sep 23". */
export function formatListTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = now.getTime() - d.getTime();
  if (diff < MINUTE) return "Now";
  if (diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)}m`;
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days === 0) return formatTime(iso);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Inside bubbles: "Now", "3m", or the clock time. */
export function formatBubbleTime(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MINUTE) return "Now";
  if (diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)}m`;
  return formatTime(iso);
}

/** Centered date divider: "Today", "Yesterday", "Monday", "Mon, Sep 23". */
export function formatDayDivider(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

export function formatLastSeen(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MINUTE) return "Last seen just now";
  if (diff < 60 * MINUTE) return `Last seen ${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY && isSameDay(iso, now.toISOString())) return `Last seen today at ${formatTime(iso)}`;
  return `Last seen ${formatDayDivider(iso, now).toLowerCase()} at ${formatTime(iso)}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "+919800000001" -> "+91 98000 00001" */
export function formatPhone(phone: string): string {
  const m = phone.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

export const DISAPPEARING_OPTIONS: { label: string; short: string; seconds: number | null }[] = [
  { label: "Off", short: "Off", seconds: null },
  { label: "30 seconds", short: "30s", seconds: 30 },
  { label: "5 minutes", short: "5m", seconds: 300 },
  { label: "1 hour", short: "1h", seconds: 3600 },
  { label: "1 day", short: "1d", seconds: 86400 },
  { label: "1 week", short: "1w", seconds: 604800 },
];

export function disappearingLabel(seconds: number | null): string {
  return DISAPPEARING_OPTIONS.find((o) => o.seconds === seconds)?.label ?? "Off";
}
