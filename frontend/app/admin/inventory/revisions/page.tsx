"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import {
  fetchAdminInventoryStockRevisions,
  type InventoryStockRevisionRow
} from "@/lib/admin-api";

const card: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.045), 0 8px 24px rgba(15,23,42,0.04)"
};
const thSt: React.CSSProperties = {
  padding: "11px 16px",
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted, #8a7060)",
  background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))",
  textAlign: "left",
  whiteSpace: "nowrap"
};
const tdSt: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "16px",
  color: "var(--admin-text, #4a3f38)",
  borderBottom: "1px solid var(--admin-card-border, #f0ece6)"
};
const inputSt: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: "8px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  background: "var(--admin-card-bg, #fff)",
  color: "var(--admin-text, #2c2420)",
  fontSize: "15px",
  minWidth: 0
};
const labelSt: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted, #8a7060)",
  marginBottom: "3px",
  whiteSpace: "nowrap"
};

export default function AdminInventoryRevisionsPage() {
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<InventoryStockRevisionRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchAdminInventoryStockRevisions({
        page,
        limit: 50,
        q: appliedQ || undefined
      });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load revision history");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, appliedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  useAdminPageHeader(
    () => ({
      title: "Revision history",
      icon: "📋",
      actions: (
        <Link
          href="/admin/inventory"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "5px 10px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            color: "#faf5ec",
            border: "1px solid rgba(232,213,168,0.45)",
            fontSize: "12px",
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap"
          }}
        >
          <ArrowLeft size={14} aria-hidden />
          Back to Inventory
        </Link>
      )
    }),
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      <div
        style={{
          ...card,
          padding: "12px 14px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "8px"
        }}
      >
        <div style={{ flex: "1 1 240px", minWidth: "180px" }}>
          <label htmlFor="rev-q" style={labelSt}>
            Search
          </label>
          <input
            id="rev-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setAppliedQ(q.trim());
              }
            }}
            placeholder="SKU, product, order…"
            style={inputSt}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            setAppliedQ(q.trim());
          }}
          style={{
            padding: "7px 12px",
            borderRadius: "8px",
            border: "1px solid #1e3a2f",
            background: "linear-gradient(135deg, #1c352a, #2d5040)",
            color: "#fffbf5",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap"
          }}
        >
          Search
        </button>
      </div>

      {err ? (
        <p style={{ color: "#dc2626", fontSize: "16px" }} role="alert">
          {err}
        </p>
      ) : null}

      <div style={{ ...card, overflowX: "auto" }}>
        {loading ? (
          <p style={{ padding: 24, color: "#8a7060", fontSize: 16 }}>Loading…</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                {[
                  "Product",
                  "Variant",
                  "SKU",
                  "Increased",
                  "Decreased",
                  "Current",
                  "Reason",
                  "Date & time",
                  "Order / Admin"
                ].map((h) => (
                  <th key={h} style={thSt}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ ...tdSt, textAlign: "center", color: "#8a7060" }}>
                    No stock revisions yet.
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr
                    key={r.id}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--admin-row-hover, #faf5ec)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <td style={tdSt}>{r.productName}</td>
                    <td style={tdSt}>{r.variantName || "—"}</td>
                    <td style={tdSt}>{r.sku}</td>
                    <td style={{ ...tdSt, color: "#166534", fontWeight: 600 }}>
                      {r.increased > 0 ? `+${r.increased}` : "—"}
                    </td>
                    <td style={{ ...tdSt, color: "#991b1b", fontWeight: 600 }}>
                      {r.decreased > 0 ? `−${r.decreased}` : "—"}
                    </td>
                    <td style={{ ...tdSt, fontWeight: 600 }}>{r.newOnHand}</td>
                    <td style={tdSt}>{r.reason.replace(/_/g, " ")}</td>
                    <td style={tdSt}>{new Date(r.createdAt).toLocaleString("en-IN")}</td>
                    <td style={tdSt}>
                      {r.orderId && r.orderNumber ? (
                        <Link
                          href={`/admin/orders/${r.orderId}`}
                          style={{ fontWeight: 600, color: "#b98a3e", textDecoration: "none" }}
                        >
                          {r.orderNumber}
                        </Link>
                      ) : (
                        r.actorLabel || "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <AdminPagination
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        itemLabel="revisions"
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
      />
    </div>
  );
}
