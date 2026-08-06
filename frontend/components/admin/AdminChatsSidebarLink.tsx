"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchEnquiryUnreadCount } from "@/lib/admin-api";
import { adminTheme as t } from "@/lib/admin-theme";

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
        borderRadius: "10px",
        marginBottom: "2px",
        color: active ? t.sidebarTextActive : t.sidebarText,
        background: active ? t.primarySoft : "transparent",
        fontSize: "13.5px",
        fontWeight: active ? 600 : 400,
        textDecoration: "none",
        transition: "background 0.15s ease, color 0.15s ease",
        borderLeft: active ? `3px solid ${t.primary}` : "3px solid transparent"
      }}
    >
      <span style={{ color: active ? t.primary : t.sidebarMuted, flexShrink: 0 }}>
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
