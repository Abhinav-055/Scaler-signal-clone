"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";
import { useRealtime } from "@/hooks/useRealtime";
import { useShortcuts } from "@/hooks/useShortcuts";
import { NavRail, BottomTabs } from "@/components/shell/Navigation";
import { ConnectionBanner } from "@/components/shell/ConnectionBanner";
import { NewChatModal } from "@/components/chats/NewChatModal";
import { NewGroupModal } from "@/components/chats/NewGroupModal";
import { AddContactModal } from "@/components/chats/AddContactModal";
import { ShortcutsModal } from "@/components/shell/ShortcutsModal";
import { SignalWordmark } from "@/components/ui/SignalBrand";

/** Route guard + shell for every logged-in page. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, bootstrap } = useAuth();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (status === "anonymous") {
      useChat.getState().reset();
      router.replace("/login");
    } else if (status === "authenticated" && user && !user.display_name) {
      router.replace("/login"); // finish profile setup first
    }
  }, [status, user, router]);

  if (status !== "authenticated" || !user?.display_name) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-secondary">
        <SignalWordmark size={44} />
        <span className="text-[13px]">Loading…</span>
      </div>
    );
  }

  // Phones: a chat is its own full screen, so the bottom tabs hide there.
  const inChat = /^\/chats\/\d+/.test(pathname);
  return (
    <Shell inChat={inChat}>{children}</Shell>
  );
}

function Shell({ children, inChat }: { children: React.ReactNode; inChat: boolean }) {
  useRealtime();
  useShortcuts();
  const modal = useUi((s) => s.modal);
  const loadConversations = useChat((s) => s.loadConversations);
  const loadContacts = useChat((s) => s.loadContacts);

  useEffect(() => {
    void loadConversations().catch(() => {});
    void loadContacts().catch(() => {});
  }, [loadConversations, loadContacts]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <div className="flex min-w-0 flex-1">{children}</div>
      </div>
      {!inChat && <BottomTabs />}
      {modal === "newChat" && <NewChatModal />}
      {modal === "newGroup" && <NewGroupModal />}
      {modal === "addContact" && <AddContactModal />}
      {modal === "shortcuts" && <ShortcutsModal />}
    </div>
  );
}
