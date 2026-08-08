"use client";

import { usePathname } from "next/navigation";

import { AdminChatsInbox } from "@/components/admin/AdminChatsInbox";

export default function AdminChatsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onThread = Boolean(pathname && /^\/admin\/chats\/[^/]+$/.test(pathname));

  return (
    <div
      className="flex w-full overflow-hidden rounded-xl border border-[#2c2420]/70 bg-[#f7f3eb] shadow-[0_4px_24px_rgba(28,53,42,0.1)]"
      style={{ height: "calc(100vh - 8.5rem)", minHeight: "480px" }}
    >
      <aside
        className={`min-h-0 w-full shrink-0 flex-col border-r border-[#2c2420]/25 md:flex md:w-[360px] lg:w-[400px] ${
          onThread ? "hidden" : "flex"
        }`}
      >
        <AdminChatsInbox />
      </aside>
      <section
        className={`min-h-0 min-w-0 flex-1 flex-col ${onThread ? "flex" : "hidden md:flex"}`}
      >
        {children}
      </section>
    </div>
  );
}
