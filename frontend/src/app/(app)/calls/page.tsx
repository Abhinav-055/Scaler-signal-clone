"use client";

import { Phone } from "lucide-react";
import { ComingSoon } from "@/components/shell/ComingSoon";

export default function CallsPage() {
  return (
    <ComingSoon
      title="Calls"
      icon={Phone}
      text="Voice and video calls aren't part of this clone yet. Your recent calls would appear here."
    />
  );
}
