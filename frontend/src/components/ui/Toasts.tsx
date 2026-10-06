"use client";

import { useUi } from "@/store/ui";

/** Bottom-center toasts, like Signal Desktop's. */
export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="toast-in pointer-events-auto max-w-sm rounded-lg bg-[#2e2e2e] px-4 py-2.5 text-center text-[13px] text-white shadow-pop dark:bg-[#e9e9e9] dark:text-[#1b1b1b]"
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
