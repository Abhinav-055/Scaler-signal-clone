"use client";

import { useEffect, useState } from "react";
import { useChat } from "@/store/chat";
import { realtime } from "@/lib/ws";

/** "Connecting…" bar shown while the WebSocket is down (after a short grace period). */
export function ConnectionBanner() {
  const status = useChat((s) => s.socketStatus);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Hide at once when connected; wait 1.2s before showing so short reconnects don't flash.
    const t = setTimeout(() => setVisible(status !== "open"), status === "open" ? 0 : 1200);
    return () => clearTimeout(t);
  }, [status]);

  if (!visible || status === "open") return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 bg-[#f5c518] px-3 py-1.5 text-[13px] font-medium text-[#1b1b1b]"
    >
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#1b1b1b] border-t-transparent" />
      Connecting…
      <button onClick={() => realtime.reconnectNow()} className="ml-2 underline underline-offset-2">
        Retry now
      </button>
    </div>
  );
}
