"use client";

import { useEffect } from "react";
import { SignalLogo } from "@/components/ui/SignalBrand";
import { useUi } from "@/store/ui";

/** Right pane when no chat is selected. */
export default function WelcomePane() {
  const setActive = useUi((s) => s.setActiveConversation);
  useEffect(() => setActive(null), [setActive]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <SignalLogo size={88} />
      <h1 className="text-[22px] font-semibold">Welcome to Signal</h1>
      <p className="max-w-xs text-secondary">
        Privacy is possible. Signal messages and calls are always end-to-end encrypted.
      </p>
      <p className="text-[12px] text-muted">
        Press <kbd className="rounded bg-input px-1.5 py-0.5">Ctrl/⌘ + N</kbd> to start a new chat
      </p>
    </div>
  );
}
