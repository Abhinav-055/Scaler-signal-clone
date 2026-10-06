"use client";

import { useId } from "react";
import { AlertCircle, Clock3 } from "lucide-react";
import type { MessageStatus } from "@/lib/types";
import { useSettings } from "@/store/settings";

const LABELS: Record<MessageStatus, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not sent",
};

/**
 * Signal-style delivery ticks:
 * sending = clock, sent = ✓ in a circle, delivered = two overlapping circles, read = two filled circles.
 * Masks cut the overlap/checks out so the icon works on any background colour.
 */
export function StatusIcon({ status: rawStatus, className = "" }: { status: MessageStatus; className?: string }) {
  const id = useId().replace(/:/g, "");
  // Reciprocal, like Signal: with your own read receipts off you don't see other people's either.
  const readReceipts = useSettings((s) => s.readReceipts);
  const status = rawStatus === "read" && !readReceipts ? "delivered" : rawStatus;
  const label = LABELS[status];

  if (status === "sending") return <Clock3 size={13} strokeWidth={2.2} className={className} aria-label={label} />;
  if (status === "failed") return <AlertCircle size={14} className={`text-danger ${className}`} aria-label={label} />;

  const check = (cx: number) => `M${cx - 3} 8.2l2 2 4-4.3`;
  if (status === "sent") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" className={className} role="img" aria-label={label}>
        <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d={check(8)} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (status === "delivered") {
    return (
      <svg width="21" height="15" viewBox="0 0 23 16" className={className} role="img" aria-label={label}>
        <defs>
          <mask id={`d${id}`}>
            <rect width="23" height="16" fill="white" />
            <circle cx="14.5" cy="8" r="7.6" fill="black" />
          </mask>
        </defs>
        <g mask={`url(#d${id})`} fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="6.3" />
          <path d={check(8)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </g>
        <g fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="14.5" cy="8" r="6.3" />
          <path d={check(14.5)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
        </g>
      </svg>
    );
  }

  // read
  return (
    <svg width="21" height="15" viewBox="0 0 23 16" className={className} role="img" aria-label={label}>
      <defs>
        <mask id={`rb${id}`}>
          <rect width="23" height="16" fill="white" />
          <circle cx="14.5" cy="8" r="7.8" fill="black" />
          <path d={check(8)} fill="none" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
        <mask id={`rf${id}`}>
          <rect width="23" height="16" fill="white" />
          <path d={check(14.5)} fill="none" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <circle cx="8" cy="8" r="7" fill="currentColor" mask={`url(#rb${id})`} />
      <circle cx="14.5" cy="8" r="7" fill="currentColor" mask={`url(#rf${id})`} />
    </svg>
  );
}
