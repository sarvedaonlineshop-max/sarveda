"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";

import { fetchPendingServiceRequestCount } from "@/lib/order-service-request";
import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import {
  applySidebarHover,
  clearSidebarHover,
  sidebarLinkStyle,
  sidebarNavStyles
} from "@/components/admin/sidebarNavStyles";

export function AdminOrdersSidebarLink({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const nav = useAdminNavOptional();
  const activePath = nav?.activePath ?? pathname;
  const active = activePath === "/admin/orders" || activePath.startsWith("/admin/orders/");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void fetchPendingServiceRequestCount()
      .then(setPending)
      .catch(() => setPending(0));
    const timer = setInterval(() => {
      void fetchPendingServiceRequestCount()
        .then(setPending)
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <Link
      href="/admin/orders"
      onClick={() => {
        nav?.beginNavigation("/admin/orders");
        onNavigate?.();
      }}
      style={sidebarLinkStyle(active)}
      onMouseEnter={(e) => applySidebarHover(e.currentTarget, active)}
      onMouseLeave={(e) => clearSidebarHover(e.currentTarget, active)}
    >
      <span
        data-nav-icon
        style={{
          color: active ? sidebarNavStyles.activeIcon : sidebarNavStyles.idleIcon,
          flexShrink: 0,
          transition: "color 0.15s ease"
        }}
      >
        <ShoppingBag size={18} strokeWidth={2} />
      </span>
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
            justifyContent: "center",
            boxShadow: "0 6px 12px rgba(220,38,38,0.26)"
          }}
        >
          {pending > 99 ? "99+" : pending}
        </span>
      ) : null}
    </Link>
  );
}
