"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchPendingServiceRequestCount } from "@/lib/order-service-request";
import { adminTheme as t } from "@/lib/admin-theme";

const ordersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export function AdminOrdersSidebarLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === "/admin/orders" || pathname.startsWith("/admin/orders/");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void fetchPendingServiceRequestCount()
      .then(setPending)
      .catch(() => setPending(0));
    const t = setInterval(() => {
      void fetchPendingServiceRequestCount()
        .then(setPending)
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(t);
  }, [pathname]);

  return (
    <Link
      href="/admin/orders"
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
      <span style={{ color: active ? t.primary : t.sidebarMuted, flexShrink: 0 }}>{ordersIcon}</span>
      <span style={{ flex: 1 }}>Orders</span>
      {pending > 0 ? (
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
          {pending > 99 ? "99+" : pending}
        </span>
      ) : null}
    </Link>
  );
}
