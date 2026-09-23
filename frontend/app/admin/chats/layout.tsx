"use client";

import { usePathname } from "next/navigation";

import { AdminChatsInbox } from "@/components/admin/AdminChatsInbox";
import { useAdminChatViewportLock } from "@/components/admin/useAdminChatViewportLock";

export default function AdminChatsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onThread = Boolean(pathname && /^\/admin\/chats\/[^/]+$/.test(pathname));
  useAdminChatViewportLock(true);

  return (
    <div
      className={`admin-chats-shell flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#efe8dc] md:h-[calc(100vh-8.5rem)] md:min-h-[480px] md:rounded-xl md:border md:border-[#2c2420]/70 md:bg-[#f7f3eb] md:shadow-[0_4px_24px_rgba(28,53,42,0.1)] ${
        onThread ? "admin-chat-thread-shell" : "admin-chat-list-shell"
      }`}
    >
      <aside
        className={`min-h-0 w-full shrink-0 flex-col md:flex md:w-[360px] md:border-r md:border-[#2c2420]/25 lg:w-[400px] ${
          onThread ? "hidden" : "flex h-full"
        }`}
      >
        <AdminChatsInbox />
      </aside>
      <section
        className={`min-h-0 min-w-0 flex-1 flex-col ${onThread ? "flex h-full" : "hidden md:flex md:h-full"}`}
      >
        {children}
      </section>
    </div>
  );
}
