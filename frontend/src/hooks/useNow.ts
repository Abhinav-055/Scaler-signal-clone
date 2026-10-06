"use client";

import { useEffect, useState } from "react";

/** Re-render every `intervalMs` so relative times ("5m", "Last seen 2m ago") stay fresh. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
