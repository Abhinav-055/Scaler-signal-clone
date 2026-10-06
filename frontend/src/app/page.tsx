"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import { SignalWordmark } from "@/components/ui/SignalBrand";

/** Entry point: send the user to the app if they have a session, else to login. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? "/chats" : "/login");
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <SignalWordmark size={44} />
    </div>
  );
}
