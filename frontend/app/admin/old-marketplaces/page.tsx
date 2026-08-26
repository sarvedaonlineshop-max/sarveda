"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import { fetchLegacyMarketplaceOrders, fetchLegacyOrdersStats } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

const CHANNELS = ["AMAZON", "FLIPKART", "ETSY", "AMALA", "FIRSTCRY", "TATA_1MG", "SARVEDA"];

export default function AdminOldMarketplacesPage() {
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [channelStats, setChannelStats] = useState<Array<{ code: string; count: number }>>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [list, stats] = await Promise.all([
        fetchLegacyMarketplaceOrders({ channel: channel || undefined, q: q.trim() || undefined, page, limit: 20 }),
        page === 1 ? fetchLegacyOrdersStats() : Promise.resolve(null)
      ]);
      setItems(list.items);
      setTotalPages(list.pagination.totalPages);
      if (stats) setChannelStats(stats.channels);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [channel, q, page]);

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
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>Old Marketplaces</h1>
        <p style={{ margin: "8px 0 0", fontSize: "13px", opacity: 0.85 }}>
          Pre-launch marketplace ops archive. Live Marketplaces starts empty at cutover — new channel syncs
          populate fresh data only.
        </p>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e8e2d9",
          padding: "16px",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center"
        }}
      >
        <select
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value);
            setPage(1);
          }}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #e8e2d9" }}
        >
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="External order id, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: "200px", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e8e2d9" }}
        />
        <Link href="/admin/old-orders" style={{ fontSize: "13px", color: "#1c352a" }}>
          ← Old Orders (merged)
        </Link>
      </div>

      {channelStats.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {channelStats.map((c) => (
            <span
              key={c.code}
              style={{
                fontSize: "11px",
                padding: "4px 10px",
                borderRadius: "999px",
                background: "#f2ede5",
                color: "#4a3728"
              }}
            >
              {c.code}: {c.count}
            </span>
          ))}
        </div>
      ) : null}

      {err ? <div style={{ padding: "16px", color: "#991b1b" }}>{err}</div> : null}

      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e8e2d9", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Date", "Channel", "External ID", "Customer", "Status", "Total"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "11px 16px",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#8a7060",
                    background: "linear-gradient(180deg,#f2ede5,#f9f7f4)",
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
                <td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#8a7060" }}>
                  No archived marketplace orders yet.
                </td>
              </tr>
            ) : (
              items.map((o) => (
                <tr key={String(o.id)}>
                  <td style={{ padding: "12px 16px", fontSize: "13px" }}>
                    {o.orderDate ? new Date(String(o.orderDate)).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "12px" }}>{String(o.channelCode ?? "")}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "12px" }}>
                    {String(o.externalOrderId ?? "")}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "13px" }}>
                    {String(o.customerName ?? "—")}
                    <div style={{ fontSize: "11px", color: "#8a7060" }}>{String(o.customerEmail ?? "")}</div>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "12px" }}>{String(o.status ?? "")}</td>
                  <td style={{ padding: "12px 16px", fontSize: "13px", fontWeight: 600 }}>
                    {formatMinorFromPaise(Number(o.grandTotalInPaise ?? 0), String(o.currency ?? "INR"))}
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
