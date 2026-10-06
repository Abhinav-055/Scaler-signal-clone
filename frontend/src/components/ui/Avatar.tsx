"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { initials } from "@/lib/format";

interface AvatarProps {
  name: string;
  url?: string | null;
  color?: string; // one of the --av-<color> token names
  size?: number;
  group?: boolean;
  online?: boolean;
  className?: string;
}

/** Photo if there is one, otherwise initials on a stable pastel colour (Signal style). */
export function Avatar({ name, url, color = "steel", size = 48, group, online, className = "" }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const style = {
    width: size,
    height: size,
    background: `var(--av-${color}-bg)`,
    color: `var(--av-${color}-fg)`,
    fontSize: Math.round(size * 0.38),
  };
  const text = initials(name);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full font-semibold select-none"
        style={style}
        aria-hidden
      >
        {url && !broken ? (
          // Plain <img>: avatars come from arbitrary Cloudinary/remote hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        ) : group || !text ? (
          <Users size={Math.round(size * 0.45)} strokeWidth={2} />
        ) : (
          text
        )}
      </div>
      {online && (
        <span
          className="absolute right-0 bottom-0 block rounded-full border-2 border-panel bg-success"
          style={{ width: Math.max(10, size * 0.26), height: Math.max(10, size * 0.26) }}
          aria-label="Online"
        />
      )}
    </div>
  );
}
