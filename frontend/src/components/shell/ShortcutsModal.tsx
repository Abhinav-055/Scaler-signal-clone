"use client";

import { Modal } from "@/components/ui/Modal";
import { useUi } from "@/store/ui";

const SHORTCUTS: [string, string][] = [
  ["Search chats", "Ctrl/⌘ + K"],
  ["New chat", "Alt + N"],
  ["Previous chat", "Alt + ↑"],
  ["Next chat", "Alt + ↓"],
  ["Send message", "Enter"],
  ["New line", "Shift + Enter"],
  ["Close dialog, panel or reply", "Esc"],
  ["Show keyboard shortcuts", "Ctrl/⌘ + /"],
];

export function ShortcutsModal() {
  const close = useUi((s) => s.closeModal);
  return (
    <Modal title="Keyboard shortcuts" onClose={close}>
      <ul className="px-4 pb-4">
        {SHORTCUTS.map(([label, keys]) => (
          <li key={label} className="flex items-center justify-between border-b border-border py-3 last:border-0">
            <span>{label}</span>
            <kbd className="rounded-md bg-input px-2 py-1 font-sans text-[12px] text-secondary">{keys}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
