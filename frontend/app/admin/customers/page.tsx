"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import type { CustomersListData } from "@/lib/admin-api";
import { fetchAdminCustomers } from "@/lib/admin-api";

const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e8e2d9", boxShadow: "0 1px 4px rgba(44,36,32,0.06)" };
const thSt: React.CSSProperties = { padding: "11px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a7060", background: "#f9f7f4", textAlign: "left" };
const tdSt: React.CSSProperties = { padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" };

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
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Customers</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>Customers sign in with OTP or Google.</p>
      </div>

      <form style={{ display: "flex", gap: "10px" }} onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q.trim()); }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, phone"
          style={{ flex: 1, minWidth: "220px", height: "40px", padding: "0 14px", borderRadius: "8px", border: "1px solid #e0d8ce", fontSize: "13px", background: "#fff", color: "#2c2420", outline: "none" }} />
        <button type="submit" style={{ height: "40px", padding: "0 20px", borderRadius: "8px", background: "#1e3a2f", color: "#fffbf5", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer" }}>Search</button>
      </form>

      {err && <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">{err}</p>}

      {data ? (
        <>
          <p style={{ fontSize: "13px", color: "#8a7060" }}>{data.pagination.total.toLocaleString("en-IN")} customers</p>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ borderBottom: "2px solid #f0ece6" }}>
                {["Email","Name","Woo ID","Orders","Joined"].map((h) => <th key={h} style={thSt}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf8f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                    <td style={{ ...tdSt, fontWeight: 500, color: "#2c2420" }}>{u.email}</td>
                    <td style={tdSt}>{u.name ?? "—"}</td>
                    <td style={{ ...tdSt, fontFamily: "monospace", fontSize: "12px", color: "#8a7060" }}>{u.wooCommerceId ?? "—"}</td>
                    <td style={{ ...tdSt, fontWeight: 600 }}>{u.orderCount}</td>
                    <td style={{ ...tdSt, fontSize: "12px", color: "#8a7060" }}>{new Date(u.createdAt).toLocaleDateString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination page={page} totalPages={data.pagination.totalPages} total={data.pagination.total} itemLabel="customers" onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))} />
        </>
      ) : (!err && <p style={{ color: "#8a7060" }} role="status">Loading...</p>)}
    </div>
  );
}
