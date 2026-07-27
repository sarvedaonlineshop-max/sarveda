"use client";

import { useEffect, useState } from "react";

import type { AdminWooProductAnalytics, WooDumpProductRow } from "@/lib/admin-api";
import { fetchAdminWooAnalytics } from "@/lib/admin-api";
import { formatINRFromPaise } from "@/lib/money";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)",
  padding: "20px 24px"
};

type TabId = "most" | "least" | "po" | "drop" | "alltime";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "most", label: "Most sold (month)" },
  { id: "least", label: "Least sold" },
  { id: "po", label: "Raise PO" },
  { id: "drop", label: "Drop candidates" },
  { id: "alltime", label: "All-time top 10" }
];

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminWooProductAnalytics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("most");

  useEffect(() => {
    fetchAdminWooAnalytics()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load analytics"));
  }, []);

  function rowsForTab(): WooDumpProductRow[] {
    if (!data) return [];
    if (tab === "most") return data.mostSoldThisMonth;
    if (tab === "least") return data.leastSoldThisMonth;
    if (tab === "po") return data.purchaseOrderNeeded;
    if (tab === "drop") return data.dropCandidates;
    return data.allTimeTopItems;
  }

  function ruleForTab(): string {
    if (!data) return "";
    if (tab === "most") return data.rules.mostSold;
    if (tab === "least") return data.rules.leastSold;
    if (tab === "po") return data.rules.purchaseOrderNeeded;
    if (tab === "drop") return data.rules.dropCandidates;
    return "Top 10 by lifetime completed units (wc-completed)";
  }

  if (err) return <p style={{ color: "#dc2626" }}>{err}</p>;
  if (!data) return <p style={{ color: "#8a7060" }}>Loading analytics...</p>;

  const rows = rowsForTab();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Product analytics</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          WooCommerce dump snapshot · {data.period.label} · no data imported into Sarveda DB
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px"
        }}
      >
        {[
          { label: "Most sold", value: data.counts.mostSoldThisMonth },
          { label: "Least sold", value: data.counts.leastSoldThisMonth },
          { label: "Raise PO", value: data.counts.purchaseOrderNeeded },
          { label: "Drop", value: data.counts.dropCandidates }
        ].map((c) => (
          <div key={c.label} style={{ ...card, padding: "16px 18px" }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8a7060",
                marginBottom: "6px"
              }}
            >
              {c.label}
            </p>
            <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#2c2420" }}>{c.value}</p>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                border: "1px solid",
                borderColor: tab === t.id ? "#1e3a2f" : "#e0d8ce",
                background: tab === t.id ? "#1e3a2f" : "#fff",
                color: tab === t.id ? "#fffbf5" : "#6b5c52"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: "12px", color: "#8a7060", marginBottom: "12px" }}>{ruleForTab()}</p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                {["#", "Item", "SKU", "Units", "Revenue"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      color: "#8a7060",
                      fontSize: "11px",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid #eee6dc"
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "16px 12px", color: "#8a7060" }}>
                    No rows for this list.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={`${row.sku}-${row.productName}-${i}`}>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f4efe8", color: "#8a7060" }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f4efe8", color: "#2c2420", fontWeight: 600 }}>
                      {row.productName}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f4efe8", color: "#2c2420" }}>
                      {row.sku || "—"}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f4efe8", color: "#2c2420" }}>
                      {row.unitsSold}
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f4efe8", color: "#2c2420" }}>
                      {formatINRFromPaise(row.revenueInPaise)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
