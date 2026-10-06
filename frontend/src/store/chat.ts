// Conversations, messages, typing and presence: everything that changes in real time.
// The store only holds and merges data; sending and socket handling live in lib/chatActions.ts
// and hooks/useRealtime.ts.
import { create } from "zustand";
import { api } from "@/lib/api";
import type {
  ChatMessage,
  Contact,
  Conversation,
  Member,
  Message,
  MessagePage,
  Reaction,
  SendPayload,
  ServerStatus,
} from "@/lib/types";
import type { SocketStatus } from "@/lib/ws";

const PAGE_SIZE = 50;
export const TYPING_TIMEOUT_MS = 5000;

interface ConversationMessages {
  items: ChatMessage[];
  hasMore: boolean;
  loaded: boolean;
  loadingOlder: boolean;
}

interface Presence {
  online: boolean;
  last_seen_at: string;
}

interface ChatState {
  conversations: Record<number, Conversation>;
  conversationsLoaded: boolean;
  messages: Record<number, ConversationMessages>;
  /** conversationId -> userId -> time (ms) the indicator expires */
  typing: Record<number, Record<number, number>>;
  presence: Record<number, Presence>;
  /** Messages sent but not yet acknowledged, keyed by client_id. Resent after a reconnect. */
  outbox: Record<string, SendPayload>;
  contacts: Contact[];
  socketStatus: SocketStatus;

  loadConversations: () => Promise<void>;
  fetchConversation: (id: number) => Promise<Conversation | null>;
  upsertConversation: (conv: Conversation) => void;
  patchConversation: (id: number, patch: Partial<Conversation>) => void;
  upsertMember: (conversationId: number, member: Member) => void;
  loadMessages: (conversationId: number) => Promise<void>;
  loadOlder: (conversationId: number) => Promise<void>;
  refreshLatest: (conversationId: number) => Promise<void>;
  addOptimistic: (msg: ChatMessage) => void;
  updatePending: (conversationId: number, clientId: string, patch: Partial<ChatMessage>) => void;
  receiveMessage: (msg: Message) => void;
  applyStatuses: (conversationId: number, updates: { message_id: number; status: ServerStatus }[]) => void;
  applyReactions: (conversationId: number, messageId: number, reactions: Reaction[]) => void;
  removeMessages: (conversationId: number, ids: number[]) => void;
  setTyping: (conversationId: number, userId: number, isTyping: boolean) => void;
  setPresence: (userId: number, presence: Presence) => void;
  queueOutbox: (payload: SendPayload) => void;
  clearOutbox: (clientId: string) => void;
  loadContacts: () => Promise<void>;
  setSocketStatus: (status: SocketStatus) => void;
  reset: () => void;
}

/** Server messages sort by id; optimistic ones (id 0) go last, in the order they were created. */
function sortKey(m: ChatMessage): number {
  return m.pending ? 1e15 + Date.parse(m.created_at) : m.id;
}

/** Merge new server messages into a list, replacing optimistic copies with the same client_id. */
function mergeMessages(existing: ChatMessage[], incoming: Message[]): ChatMessage[] {
  const byClientId = new Map(existing.map((m) => [m.client_id, m]));
  for (const msg of incoming) byClientId.set(msg.client_id, { ...msg });
  return [...byClientId.values()].sort((a, b) => sortKey(a) - sortKey(b));
}

const initialState = {
  conversations: {},
  conversationsLoaded: false,
  messages: {},
  typing: {},
  presence: {},
  outbox: {},
  contacts: [],
  socketStatus: "closed" as SocketStatus,
};

export const useChat = create<ChatState>()((set, get) => ({
  ...initialState,

  loadConversations: async () => {
    const list = await api<Conversation[]>("/conversations");
    const conversations: Record<number, Conversation> = {};
    const presence = { ...get().presence };
    for (const c of list) {
      conversations[c.id] = c;
      for (const m of c.members) presence[m.user.id] = { online: m.user.online, last_seen_at: m.user.last_seen_at };
    }
    set({ conversations, conversationsLoaded: true, presence });
  },

  fetchConversation: async (id) => {
    try {
      const conv = await api<Conversation>(`/conversations/${id}`);
      get().upsertConversation(conv);
      return conv;
    } catch {
      return null;
    }
  },

  upsertConversation: (conv) => {
    const presence = { ...get().presence };
    for (const m of conv.members) {
      presence[m.user.id] ??= { online: m.user.online, last_seen_at: m.user.last_seen_at };
    }
    set({ conversations: { ...get().conversations, [conv.id]: conv }, presence });
  },

  patchConversation: (id, patch) => {
    const conv = get().conversations[id];
    if (conv) set({ conversations: { ...get().conversations, [id]: { ...conv, ...patch } } });
  },

  upsertMember: (conversationId, member) => {
    const conv = get().conversations[conversationId];
    if (!conv) return;
    const others = conv.members.filter((m) => m.user.id !== member.user.id);
    get().patchConversation(conversationId, { members: [...others, member] });
  },

  loadMessages: async (conversationId) => {
    if (get().messages[conversationId]?.loaded) return;
    const page = await api<MessagePage>(`/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`);
    const current = get().messages[conversationId]?.items ?? [];
    set({
      messages: {
        ...get().messages,
        [conversationId]: {
          items: mergeMessages(current, page.messages),
          hasMore: page.has_more,
          loaded: true,
          loadingOlder: false,
        },
      },
    });
  },

  loadOlder: async (conversationId) => {
    const state = get().messages[conversationId];
    if (!state?.loaded || !state.hasMore || state.loadingOlder) return;
    const oldest = state.items.find((m) => !m.pending);
    const patch = (p: Partial<ConversationMessages>) =>
      set({ messages: { ...get().messages, [conversationId]: { ...get().messages[conversationId], ...p } } });
    patch({ loadingOlder: true });
    try {
      const page = await api<MessagePage>(
        `/conversations/${conversationId}/messages?limit=${PAGE_SIZE}${oldest ? `&before=${oldest.id}` : ""}`,
      );
      patch({
        items: mergeMessages(get().messages[conversationId].items, page.messages),
        hasMore: page.has_more,
        loadingOlder: false,
      });
    } catch {
      patch({ loadingOlder: false });
    }
  },

  /** After a reconnect: pull the newest page so anything missed while offline appears. */
  refreshLatest: async (conversationId) => {
    const state = get().messages[conversationId];
    if (!state?.loaded) return;
    const page = await api<MessagePage>(`/conversations/${conversationId}/messages?limit=${PAGE_SIZE}`);
    const oldestFetched = page.messages[0]?.id ?? 0;
    // Messages in the fetched window that the server no longer returns were expired or hidden.
    const kept = get().messages[conversationId].items.filter(
      (m) => m.pending || m.id < oldestFetched || page.messages.some((p) => p.id === m.id),
    );
    set({
      messages: {
        ...get().messages,
        [conversationId]: { ...get().messages[conversationId], items: mergeMessages(kept, page.messages) },
      },
    });
  },

  addOptimistic: (msg) => {
    const state = get().messages[msg.conversation_id] ?? { items: [], hasMore: false, loaded: false, loadingOlder: false };
    set({
      messages: { ...get().messages, [msg.conversation_id]: { ...state, items: [...state.items, msg] } },
    });
  },

  updatePending: (conversationId, clientId, patch) => {
    const state = get().messages[conversationId];
    if (!state) return;
    set({
      messages: {
        ...get().messages,
        [conversationId]: {
          ...state,
          items: state.items.map((m) => (m.client_id === clientId ? { ...m, ...patch } : m)),
        },
      },
    });
  },

  receiveMessage: (msg) => {
    const state = get().messages[msg.conversation_id];
    if (state) {
      set({
        messages: {
          ...get().messages,
          [msg.conversation_id]: { ...state, items: mergeMessages(state.items, [msg]) },
        },
      });
    }
    const conv = get().conversations[msg.conversation_id];
    if (conv && msg.id >= (conv.last_message?.id ?? 0)) {
      get().patchConversation(msg.conversation_id, {
        last_message: msg,
        last_message_at:
          Date.parse(msg.created_at) > Date.parse(conv.last_message_at) ? msg.created_at : conv.last_message_at,
      });
    }
  },

  applyStatuses: (conversationId, updates) => {
    const statusById = new Map(updates.map((u) => [u.message_id, u.status]));
    const state = get().messages[conversationId];
    if (state) {
      set({
        messages: {
          ...get().messages,
          [conversationId]: {
            ...state,
            items: state.items.map((m) => (statusById.has(m.id) ? { ...m, status: statusById.get(m.id)! } : m)),
          },
        },
      });
    }
    const last = get().conversations[conversationId]?.last_message;
    if (last && statusById.has(last.id)) {
      get().patchConversation(conversationId, { last_message: { ...last, status: statusById.get(last.id)! } });
    }
  },

  applyReactions: (conversationId, messageId, reactions) => {
    const state = get().messages[conversationId];
    if (!state) return;
    set({
      messages: {
        ...get().messages,
        [conversationId]: {
          ...state,
          items: state.items.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        },
      },
    });
  },

  removeMessages: (conversationId, ids) => {
    const gone = new Set(ids);
    const state = get().messages[conversationId];
    if (state) {
      set({
        messages: {
          ...get().messages,
          [conversationId]: { ...state, items: state.items.filter((m) => !gone.has(m.id)) },
        },
      });
    }
  },

  setTyping: (conversationId, userId, isTyping) => {
    const forConv = { ...(get().typing[conversationId] ?? {}) };
    if (isTyping) {
      const expiresAt = Date.now() + TYPING_TIMEOUT_MS;
      forConv[userId] = expiresAt;
      // Auto-expire if no new typing.start arrives (e.g. the other tab closed mid-sentence).
      setTimeout(() => {
        if (get().typing[conversationId]?.[userId] === expiresAt) get().setTyping(conversationId, userId, false);
      }, TYPING_TIMEOUT_MS);
    } else {
      delete forConv[userId];
    }
    set({ typing: { ...get().typing, [conversationId]: forConv } });
  },

  setPresence: (userId, presence) => set({ presence: { ...get().presence, [userId]: presence } }),

  queueOutbox: (payload) => set({ outbox: { ...get().outbox, [payload.client_id]: payload } }),

  clearOutbox: (clientId) => {
    if (!(clientId in get().outbox)) return;
    const outbox = { ...get().outbox };
    delete outbox[clientId];
    set({ outbox });
  },

  loadContacts: async () => {
    set({ contacts: await api<Contact[]>("/contacts") });
  },

  setSocketStatus: (socketStatus) => set({ socketStatus }),

  reset: () => set(initialState),
}));

/** Conversations sorted by most recent activity (what the list shows). */
export function sortedConversations(conversations: Record<number, Conversation>): Conversation[] {
  return Object.values(conversations).sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at));
}
