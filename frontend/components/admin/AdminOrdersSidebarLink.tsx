"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";

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
  // Cancellation and return requests are the only thing that needs a human to act,
  // so they keep the badge. Nothing else in admin surfaces them.
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const loadCount = async () => {
      try {
        setPending(await fetchPendingServiceRequestCount());
      } catch {
        // Keep the last known value during a transient refresh failure.
      }
    };

    void loadCount();
    const timer = setInterval(() => void loadCount(), 60_000);
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
        <ShoppingCart size={18} strokeWidth={2} />
      </span>
      <span style={{ flex: 1 }}>Orders</span>
      {pending > 0 ? (
        <span
          title="Cancellation / return requests awaiting action"
          aria-label={`${pending} cancellation or return requests awaiting action`}
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
