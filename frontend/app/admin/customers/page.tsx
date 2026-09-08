"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import type { CustomersListData } from "@/lib/admin-api";
import { fetchAdminCustomers } from "@/lib/admin-api";

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
  textAlign: "left"
};
const tdSt: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "16px",
  color: "var(--admin-text, #4a3f38)",
  borderBottom: "1px solid var(--admin-card-border, #f0ece6)"
};
const inputSt: React.CSSProperties = {
  flex: 1,
  minWidth: "220px",
  boxSizing: "border-box",
  padding: "6px 8px",
  borderRadius: "8px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  background: "var(--admin-card-bg, #fff)",
  color: "var(--admin-text, #2c2420)",
  fontSize: "15px"
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

function orderCountPill(count: number): React.CSSProperties {
  if (count >= 5) {
    return {
      background: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
      color: "#166534",
      borderRadius: "999px",
      padding: "3px 10px",
      fontSize: "14px",
      fontWeight: 700
    };
  }
  if (count >= 1) {
    return {
      background: "#fef3c7",
      color: "#92400e",
      borderRadius: "999px",
      padding: "3px 10px",
      fontSize: "14px",
      fontWeight: 700
    };
  }
  return {
    background: "#f3f4f6",
    color: "#6b7280",
    borderRadius: "999px",
    padding: "3px 10px",
    fontSize: "14px",
    fontWeight: 700
  };
}

export default function AdminCustomersPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomersListData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetchAdminCustomers({ q: search || undefined, page, limit: 20 });
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setData(null);
    }
  }, [search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useAdminPageHeader(
    () => ({
      title: "Customers",
      icon: "👥",
      subtitle: <>Customers sign in with OTP or Google.</>,
      actions: data ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 12px",
            borderRadius: "999px",
            background: "transparent",
            color: "var(--admin-text, #1c352a)",
            border: "1px solid var(--admin-card-border, #e0d8ce)",
            fontSize: "14px",
            fontWeight: 700,
            whiteSpace: "nowrap"
          }}
        >
          {data.pagination.total.toLocaleString("en-IN")} customers
        </span>
      ) : undefined
    }),
    [data]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <form
        style={{
          ...card,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "12px 14px"
        }}
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <label htmlFor="customer-search" style={labelSt}>
          Search customers
        </label>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            id="customer-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email, name, phone"
            style={inputSt}
          />
          <button
            type="submit"
            style={{
              padding: "7px 12px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #1c352a, #2d5040)",
              color: "#fffbf5",
              fontSize: "15px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(28,53,42,0.2)"
            }}
          >
            Search
          </button>
        </div>
      </form>

      {err && (
        <p style={{ color: "#dc2626", fontSize: "16px" }} role="alert">
          {err}
        </p>
      )}

      {data ? (
        <>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  <th key="avatar" style={thSt} />
                  {["Email", "Name", "Woo ID", "Orders", "Joined"].map((h) => (
                    <th key={h} style={thSt}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => {
                  const initial = (u.name ?? u.email).charAt(0).toUpperCase();
                  return (
                    <tr
                      key={u.id}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--admin-row-hover, #faf5ec)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "";
                      }}
                    >
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
                      <td
                        style={{
                          ...tdSt,
                          fontWeight: 500,
                          color: "#2c2420",
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          fontSize: "14px"
                        }}
                      >
                        {u.email}
                      </td>
                      <td style={tdSt}>{u.name ?? "—"}</td>
                      <td
                        style={{
                          ...tdSt,
                          fontFamily: "monospace",
                          fontSize: "14px",
                          color: "#b98a3e"
                        }}
                      >
                        {u.wooCommerceId ?? "—"}
                      </td>
                      <td style={{ ...tdSt, fontWeight: 600 }}>
                        <span style={orderCountPill(u.orderCount)}>{u.orderCount}</span>
                      </td>
                      <td style={{ ...tdSt, color: "#8a7060" }}>
                        {new Date(u.createdAt).toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            itemLabel="customers"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
          />
        </>
      ) : (
        !err && (
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
            <span style={{ fontSize: "16px" }}>Loading customers…</span>
          </div>
        )
      )}
    </div>
  );
}
