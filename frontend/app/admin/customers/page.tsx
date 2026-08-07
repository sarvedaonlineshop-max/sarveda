"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import type { CustomersListData } from "@/lib/admin-api";
import { fetchAdminCustomers } from "@/lib/admin-api";

const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e8e2d9", boxShadow: "0 1px 4px rgba(44,36,32,0.06)" };
const thSt: React.CSSProperties = {
  padding: "13px 16px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8a7060",
  background: "linear-gradient(180deg, #f2ede5, #f9f7f4)",
  textAlign: "left"
};
const tdSt: React.CSSProperties = { padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" };

function orderCountPill(count: number): React.CSSProperties {
  if (count >= 5) {
    return {
      background: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
      color: "#166534",
      borderRadius: "999px",
      padding: "2px 10px",
      fontSize: "12px",
      fontWeight: 700
    };
  }
  if (count >= 1) {
    return {
      background: "#fef3c7",
      color: "#92400e",
      borderRadius: "999px",
      padding: "2px 10px",
      fontSize: "12px",
      fontWeight: 700
    };
  }
  return {
    background: "#f3f4f6",
    color: "#6b7280",
    borderRadius: "999px",
    padding: "2px 10px",
    fontSize: "12px",
    fontWeight: 700
  };
}

export default function AdminCustomersPage() {
  const [q, setQ] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomersListData | null>(null); const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { const res = await fetchAdminCustomers({ q: search || undefined, page, limit: 20 }); setData(res); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setData(null); }
  }, [search, page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          borderRadius: "16px",
          padding: "22px 28px",
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px"
        }}
      >
        <div>
          <h1 style={{ fontSize: "30px", fontWeight: 700, color: "#faf5ec", margin: 0 }}>👥 Customers</h1>
          <p style={{ fontSize: "13px", color: "#a8c4b0", marginTop: "4px" }}>
            Customers sign in with OTP or Google.
          </p>
        </div>
        {data ? (
          <span
            style={{
              background: "rgba(185,138,62,0.2)",
              color: "#f6c95a",
              borderRadius: "999px",
              padding: "4px 12px",
              fontSize: "12px",
              fontWeight: 700
            }}
          >
            {data.pagination.total.toLocaleString("en-IN")} customers
          </span>
        ) : null}
      </div>

      <form
        style={{
          ...card,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "16px 20px"
        }}
        onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}
      >
        <label
          htmlFor="customer-search"
          style={{
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "#8a7060",
            marginBottom: "6px"
          }}
        >
          Search customers
        </label>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            id="customer-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email, name, phone"
            style={{
              flex: 1,
              minWidth: "220px",
              height: "40px",
              padding: "0 14px",
              borderRadius: "8px",
              border: "1px solid #e0d8ce",
              fontSize: "13px",
              background: "#fff",
              color: "#2c2420",
              outline: "none"
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#b98a3e";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(185,138,62,0.12)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#e0d8ce";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <button
            type="submit"
            style={{
              height: "40px",
              padding: "0 20px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #1c352a, #2d5040)",
              color: "#fffbf5",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(28,53,42,0.2)"
            }}
          >
            🔍 Search
          </button>
        </div>
      </form>

      {err && <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">{err}</p>}

      {data ? (
        <>
          <div style={{ ...card, overflowX: "auto", boxShadow: "0 4px 20px rgba(28,53,42,0.07)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "2px solid #f0ece6" }}>
                <th key="avatar" style={thSt} />
                {["Email","Name","Woo ID","Orders","Joined"].map((h) => <th key={h} style={thSt}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.items.map((u) => {
                  const initial = (u.name ?? u.email).charAt(0).toUpperCase();
                  return (
                  <tr key={u.id} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf5ec"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                    <td style={{ ...tdSt, width: "52px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, #1c352a, #2d5040)",
                          color: "#faf5ec",
                          fontSize: "14px",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textTransform: "uppercase"
                        }}
                        aria-hidden
                      >
                        {initial}
                      </div>
                    </td>
                    <td style={{ ...tdSt, fontWeight: 500, color: "#2c2420", fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: "12px" }}>{u.email}</td>
                    <td style={tdSt}>{u.name ?? "—"}</td>
                    <td style={{ ...tdSt, fontFamily: "monospace", fontSize: "12px", color: "#b98a3e" }}>{u.wooCommerceId ?? "—"}</td>
                    <td style={{ ...tdSt, fontWeight: 600 }}>
                      <span style={orderCountPill(u.orderCount)}>{u.orderCount}</span>
                    </td>
                    <td style={{ ...tdSt, fontSize: "12px", color: "#8a7060" }}>{new Date(u.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AdminPagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} itemLabel="customers" onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))} />
        </>
      ) : (!err && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#8a7060",
            padding: "40px 16px",
            justifyContent: "center"
          }}
          role="status"
        >
          <span style={{ fontSize: "20px" }}>👥</span>
          <span style={{ fontSize: "13px" }}>Loading customers…</span>
        </div>
      ))}
    </div>
  );
}
