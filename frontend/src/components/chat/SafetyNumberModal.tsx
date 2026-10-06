"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * 60-digit "safety number" derived from both user ids (SHA-512, 12 groups of 5 digits).
 * Sorting the ids first means both people see the same number.
 * Real Signal derives it from both users' identity keys; ours is only a demo.
 */
export async function safetyNumber(a: number, b: number): Promise<string[]> {
  const [lo, hi] = [a, b].sort((x, y) => x - y);
  const data = new TextEncoder().encode(`signal-clone-safety:${lo}:${hi}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-512", data));
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    // 5 bytes -> a number -> 5 digits
    let n = 0;
    for (let j = 0; j < 5; j++) n = n * 256 + hash[i * 5 + j];
    groups.push(String(n % 100000).padStart(5, "0"));
  }
  return groups;
}

export function SafetyNumberModal({
  meId,
  peerId,
  peerName,
  onClose,
}: {
  meId: number;
  peerId: number;
  peerName: string;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<string[] | null>(null);

  useEffect(() => {
    void safetyNumber(meId, peerId).then(setGroups);
  }, [meId, peerId]);

  return (
    <Modal title="Safety number" onClose={onClose}>
      <div className="flex flex-col items-center px-6 pb-6 text-center">
        <ShieldCheck size={40} className="text-accent" />
        <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-2 rounded-xl bg-input px-5 py-4 font-mono text-[17px] tracking-wider">
          {(groups ?? Array(12).fill("·····")).map((g, i) => (
            <span key={i}>{g}</span>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-secondary">
          If you and {peerName} see the same number, your chat would be verified in real Signal.
        </p>
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-[12px] text-text">
          <strong>Demo note:</strong> encryption here is simulated. Messages travel over TLS (HTTPS/WSS) and are stored
          on the server in plain text. This number is a hash of both user IDs, not of real identity keys.
        </p>
      </div>
    </Modal>
  );
}
