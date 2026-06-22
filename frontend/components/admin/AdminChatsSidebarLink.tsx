"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchEnquiryUnreadCount } from "@/lib/admin-api";

export function AdminChatsSidebarLink({
  onNavigate
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === "/admin/chats" || pathname.startsWith("/admin/chats/");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    void fetchEnquiryUnreadCount()
      .then(setUnread)
      .catch(() => setUnread(0));
    const t = setInterval(() => {
      void fetchEnquiryUnreadCount()
        .then(setUnread)
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(t);
  }, [pathname]);

  return (
    <Link
      href="/admin/chats"
      onClick={onNavigate}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        borderRadius: "8px",
        marginBottom: "2px",
        color: active ? "#fffbf5" : "rgba(255,255,255,0.55)",
        background: active ? "rgba(200,150,10,0.18)" : "transparent",
        fontSize: "13.5px",
        fontWeight: active ? 600 : 400,
        textDecoration: "none",
        transition: "all 0.15s ease",
        borderLeft: active ? "3px solid #c8960a" : "3px solid transparent"
      }}
    >
      <span style={{ color: active ? "#c8960a" : "rgba(255,255,255,0.4)", flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </span>
      <span style={{ flex: 1 }}>Chats</span>
      {unread > 0 ? (
        <span
          style={{
            minWidth: "20px",
            height: "20px",
            padding: "0 6px",
            borderRadius: "999px",
            background: "#dc2626",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
