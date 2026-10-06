// Desktop notifications (browser Notification API) and a short notification sound.
import { useSettings } from "@/store/settings";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

let audio: AudioContext | null = null;

function playChime(): void {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, audio.currentTime + 0.08);
    gain.gain.setValueAtTime(0.08, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.25);
  } catch {
    // audio not allowed yet (no user gesture); ignore
  }
}

export function showMessageNotification(title: string, body: string, onClick: () => void): void {
  const settings = useSettings.getState();
  if (!settings.notificationsEnabled) return;
  if (settings.notificationSound) playChime();
  if (!notificationsSupported() || Notification.permission !== "granted") return;

  const content =
    settings.notificationContent === "name-and-message"
      ? { title, body }
      : settings.notificationContent === "name-only"
        ? { title, body: "New message" }
        : { title: "Signal", body: "New message" };
  const n = new Notification(content.title, { body: content.body, tag: title, silent: true });
  n.onclick = () => {
    window.focus();
    onClick();
    n.close();
  };
}
