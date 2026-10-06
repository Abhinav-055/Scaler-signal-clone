// User preferences, saved in localStorage (they are per-device, like Signal Desktop's).
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Theme = "system" | "light" | "dark";
export type NotificationContent = "name-and-message" | "name-only" | "nothing";

interface SettingsState {
  theme: Theme;
  enterToSend: boolean;
  spellCheck: boolean;
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationContent: NotificationContent;
  readReceipts: boolean;
  typingIndicators: boolean;
  /** Hamburger on the nav rail: shrink the chat list to avatars only (desktop). */
  listCollapsed: boolean;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      enterToSend: true,
      spellCheck: true,
      notificationsEnabled: true,
      notificationSound: true,
      notificationContent: "name-and-message",
      readReceipts: true,
      typingIndicators: true,
      listCollapsed: false,
      set: (patch) => set(patch),
    }),
    {
      name: "signal.settings",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
