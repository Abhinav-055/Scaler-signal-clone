"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  /** Left side of the header, e.g. a back button. */
  headerLeft?: React.ReactNode;
  footer?: React.ReactNode;
}

/** Centered dialog with a dimmed backdrop. Esc and backdrop click close it. Full screen on phones. */
export function Modal({ title, onClose, children, width = 440, headerLeft, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    // Move focus into the dialog for keyboard and screen-reader users.
    const first = panelRef.current?.querySelector<HTMLElement>("input, button, [tabindex]");
    first?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay md:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full flex-col overflow-hidden bg-elevated shadow-pop md:h-auto md:max-h-[85vh] md:rounded-xl"
        style={{ maxWidth: `min(100%, ${width}px)` }}
      >
        {(title || headerLeft) && (
          <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2">
            {headerLeft}
            <h2 className="flex-1 truncate text-[17px] font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-secondary hover:bg-hover"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
