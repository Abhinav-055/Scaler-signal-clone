"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { sortedConversations, useChat } from "@/store/chat";
import { useUi } from "@/store/ui";

/** Global keyboard shortcuts (Esc is handled by whatever is open: modal, panel, reply). */
export function useShortcuts(): void {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const ui = useUi.getState();
      const key = e.key.toLowerCase();

      if (mod && key === "k") {
        e.preventDefault();
        if (!pathname.startsWith("/chats")) router.push("/chats");
        ui.closeModal();
        ui.focusSearch();
      } else if ((mod && key === "n") || (e.altKey && !mod && e.code === "KeyN")) {
        // Browsers reserve Ctrl/⌘+N for "new window" and never pass it to the page, so in a
        // normal tab Alt+N is the working shortcut. Ctrl/⌘+N still works when the site runs as
        // an installed app. e.code is used because Option+N on a Mac types "˜" as e.key.
        e.preventDefault();
        ui.openModal("newChat");
      } else if (mod && (key === "/" || key === "?")) {
        e.preventDefault();
        ui.openModal(ui.modal === "shortcuts" ? null : "shortcuts");
      } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const list = sortedConversations(useChat.getState().conversations).filter((c) => !c.archived);
        if (list.length === 0) return;
        const index = list.findIndex((c) => c.id === ui.activeConversationId);
        const step = e.key === "ArrowUp" ? -1 : 1;
        const next = index === -1 ? 0 : (index + step + list.length) % list.length;
        router.push(`/chats/${list[next].id}`);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, pathname]);
}
