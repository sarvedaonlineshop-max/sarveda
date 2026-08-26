"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import { fetchLegacyOrders, fetchLegacyOrdersStats, type LegacyOrderListItem } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

const card: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  boxShadow: "0 4px 20px rgba(28,53,42,0.08)"
};

export default function AdminOldOrdersPage() {
  const [source, setSource] = useState<"" | "D2C" | "MARKETPLACE">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LegacyOrderListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<{ legacyOrdersTotal: number; legacyOrdersD2c: number; legacyOrdersMarketplaceMerged: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [list, s] = await Promise.all([
        fetchLegacyOrders({ source: source || undefined, q: q.trim() || undefined, page, limit: 20 }),
        page === 1 ? fetchLegacyOrdersStats() : Promise.resolve(null)
      ]);
      setItems(list.items);
      setTotalPages(list.pagination.totalPages);
      if (s) setStats(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load old orders");
    }
  }, [source, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #3d2e24 0%, #5c4a3d 100%)",
          borderRadius: "16px",
          padding: "22px 28px",
          color: "#f5efe6"
        }}
      >
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>Old Orders</h1>
        <p style={{ margin: "8px 0 0", fontSize: "13px", opacity: 0.85 }}>
          Pre-launch history — WooCommerce imports, marketplace sales, and staging checkouts (deduped). Live Orders
          shows website orders from 01-Sep-2026 onward plus accounting fixtures.
        </p>
        {stats ? (
          <p style={{ margin: "10px 0 0", fontSize: "12px", opacity: 0.75 }}>
            Archived: {stats.legacyOrdersTotal} total · {stats.legacyOrdersD2c} D2C ·{" "}
            {stats.legacyOrdersMarketplaceMerged} marketplace (non-overlap)
          </p>
        ) : null}
      </div>

      <div style={{ ...card, padding: "16px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value as "" | "D2C" | "MARKETPLACE");
            setPage(1);
          }}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #e8e2d9" }}
        >
          <option value="">All sources</option>
          <option value="D2C">Website / Woo</option>
          <option value="MARKETPLACE">Marketplace</option>
        </select>
        <input
          type="search"
          placeholder="Order #, email, external id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (setPage(1), void load())}
          style={{ flex: 1, minWidth: "200px", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e8e2d9" }}
        />
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void load();
          }}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            background: "#1c352a",
            color: "#fff",
            cursor: "pointer"
          }}
        >
          Search
        </button>
        <Link href="/admin/old-marketplaces" style={{ fontSize: "13px", color: "#1c352a" }}>
          Old Marketplaces →
        </Link>
      </div>

      {err ? (
        <div style={{ ...card, padding: "16px", color: "#991b1b", fontSize: "14px" }}>{err}</div>
      ) : null}

      <div style={{ ...card, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Date", "Source", "Order", "Customer", "Status", "Total", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "11px 16px",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--admin-text-muted, #8a7060)",
                    background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))",
                    textAlign: "left"
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#8a7060", fontSize: "14px" }}>
                  No archived orders yet. Run the launch cutover script on the backend after backup.
                </td>
              </tr>
            ) : (
              items.map((o) => (
                <tr key={o.id}>
                  <td style={{ padding: "12px 16px", fontSize: "13px" }}>
                    {new Date(o.orderDate).toLocaleDateString("en-IN")}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "12px" }}>
                    {o.source}
                    {o.channelCode ? ` · ${o.channelCode}` : ""}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", fontFamily: "monospace" }}>
                    {o.orderNumber ?? o.externalOrderId ?? "—"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px" }}>
                    <div>{o.customerName ?? "—"}</div>
                    <div style={{ fontSize: "11px", color: "#8a7060" }}>{o.customerEmail ?? ""}</div>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "12px" }}>{o.status}</td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600 }}>
                    {formatMinorFromPaise(o.grandTotalInPaise, o.currency)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Link href={`/admin/old-orders/${o.id}`} style={{ fontSize: "13px", color: "#1c352a" }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
