"use client";

import { useParams } from "next/navigation";
import { ChatPane } from "@/components/chat/ChatPane";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  // key: remount per conversation so scroll position, drafts and panels reset cleanly.
  return <ChatPane key={id} conversationId={id} />;
}
