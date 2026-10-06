"use client";

import { useEffect, useRef, useState } from "react";

const CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: "Smileys",
    emojis: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 🤗 🤭 🤫 🤔 😐 😑 😶 🙄 😏 😬 😌 😔 😴 😷 🤒 🥵 🥶 🥳 😎 🤓 😕 😟 😮 😯 😲 😳 🥺 😢 😭 😱 😤 😡 🤯".split(" "),
  },
  {
    name: "Gestures",
    emojis: "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👋 👏 🙌 👐 🤝 🙏 💪 👀 🫶 ✍️ 💅 🤷 🤦 🙋 🙇 💁".split(" "),
  },
  {
    name: "Hearts",
    emojis: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✨ 🔥 💯 ⭐ 🌟 💫".split(" "),
  },
  {
    name: "Nature & food",
    emojis: "🐶 🐱 🐼 🦊 🐵 🦁 🐯 🐮 🌸 🌻 🌈 ☀️ 🌙 ⛰️ 🏔️ 🌊 ☕ 🍵 🍕 🍔 🍟 🌮 🍜 🍛 🍰 🎂 🍫 🍎 🥭 🍺".split(" "),
  },
  {
    name: "Activities & objects",
    emojis: "🎉 🎊 🎁 🎈 🏏 ⚽ 🏀 🎮 🎧 🎵 🎶 📷 💻 📱 💡 📌 📎 ✅ ❌ ⚠️ 🚀 ✈️ 🚗 🏠 ⏰ 📅 💰 🏆".split(" "),
  },
];

export const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢"];

/** Small emoji grid in a popover. Closes on outside click or Esc. */
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState(0);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji picker"
      className="w-[300px] max-w-[calc(100vw-24px)] rounded-xl border border-border bg-elevated p-2 shadow-pop"
    >
      <div className="mb-1 flex gap-1 overflow-x-auto border-b border-border pb-1">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.name}
            onClick={() => setCategory(i)}
            className={`rounded-md px-2 py-1 text-[16px] ${i === category ? "bg-selected" : "hover:bg-hover"}`}
            aria-label={c.name}
            title={c.name}
          >
            {c.emojis[0]}
          </button>
        ))}
      </div>
      <p className="px-1 py-1 text-[12px] font-medium text-secondary">{CATEGORIES[category].name}</p>
      <div className="grid max-h-[200px] grid-cols-8 gap-0.5 overflow-y-auto">
        {CATEGORIES[category].emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onPick(emoji)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[20px] hover:bg-hover"
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
