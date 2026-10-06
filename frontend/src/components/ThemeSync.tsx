"use client";

import { useEffect } from "react";
import { useSettings } from "@/store/settings";

/** Applies the Appearance setting to <html data-theme>, following the OS when set to "system". */
export function ThemeSync() {
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const effective = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = effective;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return null;
}
