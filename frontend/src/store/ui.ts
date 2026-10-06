// Transient UI state: toasts, which modal is open, the chat that is on screen.
import { create } from "zustand";
import type { ChatMessage } from "@/lib/types";

export type ModalName = "newChat" | "newGroup" | "addContact" | "shortcuts" | null;

interface Toast {
  id: number;
  text: string;
}

interface UiState {
  toasts: Toast[];
  modal: ModalName;
  /** Conversation currently on screen (null on the list / other tabs). */
  activeConversationId: number | null;
  /** Message being replied to, per conversation. */
  replyTo: Record<number, ChatMessage | undefined>;
  /** Bumped to ask the conversation list to focus its search box (Ctrl+K). */
  searchFocusTick: number;
  /** Ask the open chat to scroll to (and flash) a message; `tick` makes repeats re-trigger. */
  jumpTarget: { conversationId: number; messageId: number; tick: number } | null;

  toast: (text: string) => void;
  dismissToast: (id: number) => void;
  openModal: (modal: ModalName) => void;
  closeModal: () => void;
  setActiveConversation: (id: number | null) => void;
  setReplyTo: (conversationId: number, message: ChatMessage | undefined) => void;
  focusSearch: () => void;
  jumpToMessage: (conversationId: number, messageId: number) => void;
}

let nextToastId = 1;

export const useUi = create<UiState>()((set, get) => ({
  toasts: [],
  modal: null,
  activeConversationId: null,
  replyTo: {},
  searchFocusTick: 0,
  jumpTarget: null,

  toast: (text) => {
    const id = nextToastId++;
    set({ toasts: [...get().toasts.slice(-2), { id, text }] });
    setTimeout(() => get().dismissToast(id), 3000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setReplyTo: (conversationId, message) => set({ replyTo: { ...get().replyTo, [conversationId]: message } }),
  focusSearch: () => set({ searchFocusTick: get().searchFocusTick + 1 }),
  jumpToMessage: (conversationId, messageId) =>
    set({ jumpTarget: { conversationId, messageId, tick: (get().jumpTarget?.tick ?? 0) + 1 } }),
}));

/** Shortcut for non-React code. */
export const toast = (text: string) => useUi.getState().toast(text);
