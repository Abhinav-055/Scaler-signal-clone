"use client";

import { usePathname } from "next/navigation";
import { ConversationList } from "@/components/chats/ConversationList";
import { useSettings } from "@/store/settings";

/**
 * Two panes: conversation list + the selected chat.
 * Below 768px only one is visible at a time (list, or chat with a back button).
 */
export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inChat = /^\/chats\/\d+/.test(pathname);
  // The rail's hamburger shrinks the list to an avatar column (tablet/desktop only).
  const collapsed = useSettings((s) => s.listCollapsed);

  return (
    <div className="flex min-w-0 flex-1">
      <aside
        className={`${inChat ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-border bg-panel ${collapsed ? "md:w-[88px]" : "md:w-[290px] lg:w-[330px]"}`}
      >
        <ConversationList compact={collapsed} />
      </aside>
      <section className={`${inChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-bg`}>{children}</section>
    </div>
  );
}
