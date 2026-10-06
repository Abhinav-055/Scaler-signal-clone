// Who is logged in. The token lives in localStorage so the session survives a refresh.
import { create } from "zustand";
import { ApiError, api, getToken, setToken, setUnauthorizedHandler } from "@/lib/api";
import type { AuthResponse, User } from "@/lib/types";

type AuthStatus = "unknown" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  token: string | null;
  /** Check the stored token once on page load. */
  bootstrap: () => Promise<void>;
  login: (res: AuthResponse) => void;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
  /** Clear local state only (token already invalid). */
  reset: () => void;
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: "unknown",
  user: null,
  token: null,

  bootstrap: async () => {
    if (get().status !== "unknown") return;
    const token = getToken();
    if (!token) {
      set({ status: "anonymous" });
      return;
    }
    try {
      const user = await api<User>("/auth/me");
      set({ status: "authenticated", user, token });
    } catch (err) {
      // 401 already triggered reset() via the unauthorized handler.
      // Server unreachable: keep the token and try again shortly instead of logging out.
      if (err instanceof ApiError && err.status === 0) {
        setTimeout(() => void get().bootstrap(), 3000);
      } else if (get().status === "unknown") {
        get().reset();
      }
    }
  },

  login: ({ token, user }) => {
    setToken(token);
    set({ status: "authenticated", user, token });
  },

  setUser: (user) => set({ user }),

  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // logging out locally is what matters
    }
    get().reset();
  },

  reset: () => {
    setToken(null);
    set({ status: "anonymous", user: null, token: null });
  },
}));

setUnauthorizedHandler(() => useAuth.getState().reset());
