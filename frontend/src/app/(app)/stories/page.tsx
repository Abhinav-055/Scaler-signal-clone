"use client";

import { CircleDashed } from "lucide-react";
import { ComingSoon } from "@/components/shell/ComingSoon";

export default function StoriesPage() {
  return (
    <ComingSoon
      title="Stories"
      icon={CircleDashed}
      text="Share photos and short updates that disappear after 24 hours. Coming in a future version."
    />
  );
}
