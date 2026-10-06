"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { displayName } from "@/lib/conversation";
import { formatDateTime } from "@/lib/format";
import type { ChatMessage, Conversation, MessageInfo } from "@/lib/types";
import { useChat } from "@/store/chat";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/controls";
import { StatusIcon } from "./StatusIcon";

/** "Message info": when the message was sent, and per recipient when it was delivered and read. */
export function MessageInfoModal({ msg, conv, onClose }: { msg: ChatMessage; conv: Conversation; onClose: () => void }) {
  const contacts = useChat((s) => s.contacts);
  const [info, setInfo] = useState<MessageInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<MessageInfo>(`/messages/${msg.id}/info`).then(setInfo, () => setError(true));
  }, [msg.id]);

  return (
    <Modal title="Message info" onClose={onClose}>
      <div className="px-4 pb-4">
        <div className="mb-3 rounded-xl bg-input px-3 py-2 text-[14px]">
          <div className="line-clamp-3 break-words">{msg.body || (msg.type === "image" ? "Photo" : "File")}</div>
          <div className="mt-1 text-[12px] text-secondary">Sent {formatDateTime(msg.created_at)}</div>
        </div>
        {!info && !error && (
          <div className="flex justify-center py-6 text-secondary">
            <Spinner />
          </div>
        )}
        {error && <p className="py-4 text-center text-secondary">Could not load message info.</p>}
        {info && (
          <ul>
            {info.receipts.map((r) => {
              const member = conv.members.find((m) => m.user.id === r.user_id);
              if (!member) return null;
              const status = r.read_at ? "read" : r.delivered_at ? "delivered" : "sent";
              return (
                <li key={r.user_id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                  <Avatar name={member.user.display_name} url={member.user.avatar_url} color={member.user.avatar_color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {displayName(member.user, contacts)}
                      {member.left_at && <span className="text-secondary"> (left)</span>}
                    </div>
                    <div className="text-[12px] text-secondary">
                      {r.read_at
                        ? `Read ${formatDateTime(r.read_at)}`
                        : r.delivered_at
                          ? `Delivered ${formatDateTime(r.delivered_at)}`
                          : "Not delivered yet"}
                    </div>
                    {r.read_at && r.delivered_at && (
                      <div className="text-[12px] text-secondary">Delivered {formatDateTime(r.delivered_at)}</div>
                    )}
                  </div>
                  <StatusIcon status={status} className="text-secondary" />
                </li>
              );
            })}
            {info.receipts.length === 0 && <li className="py-4 text-center text-secondary">No recipients.</li>}
          </ul>
        )}
      </div>
    </Modal>
  );
}
