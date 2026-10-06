"use client";

import { useEffect } from "react";
import { Download, X } from "lucide-react";

/** Full-screen image viewer. */
export function Lightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="truncate text-[14px]">{name}</span>
        <div className="flex gap-1">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            download={name}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="Download"
          >
            <Download size={20} />
          </a>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close" autoFocus>
            <X size={22} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          className="max-h-full max-w-full rounded object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
