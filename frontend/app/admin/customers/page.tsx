"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminPagination } from "@/components/admin/AdminPagination";
import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import type { CustomerOrdersData, CustomersListData } from "@/lib/admin-api";
import { fetchAdminCustomerOrders, fetchAdminCustomers } from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";
import { formatAdminOrderStatusLabel } from "@/lib/order-status-display";

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

export default function AdminCustomersPage() {
  const router = useRouter();
  const nav = useAdminNavOptional();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomersListData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ordersData, setOrdersData] = useState<CustomerOrdersData | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersErr, setOrdersErr] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

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

  const loadOrders = useCallback(async (customerId: string, p: number) => {
    setOrdersLoading(true);
    setOrdersErr(null);
    try {
      const res = await fetchAdminCustomerOrders(customerId, { page: p, limit: 20 });
      setOrdersData(res);
    } catch (e) {
      setOrdersErr(e instanceof Error ? e.message : "Failed to load orders");
      setOrdersData(null);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void loadOrders(selectedId, ordersPage);
  }, [selectedId, ordersPage, loadOrders]);

  useAdminPageHeader(
    () => ({
      title: selectedId && ordersData ? ordersData.customer.name || ordersData.customer.email : "Customers",
      icon: "👥",
      subtitle: selectedId ? (
        <>Customer orders</>
      ) : (
        <>Customers sign in with OTP or Google.</>
      ),
      actions: selectedId ? (
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setOrdersData(null);
            setOrdersPage(1);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 10px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.08)",
            color: "#faf5ec",
            border: "1px solid rgba(232,213,168,0.45)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          ← Back to customers
        </button>
      ) : data ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "5px 10px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.1)",
            color: "#faf5ec",
            border: "1px solid rgba(232,213,168,0.45)",
            fontSize: "12px",
            fontWeight: 700,
            whiteSpace: "nowrap"
          }}
        >
          {data.pagination.total.toLocaleString("en-IN")} customers
        </span>
      ) : undefined
    }),
    [data, selectedId, ordersData]
  );

  if (selectedId) {
    const c = ordersData?.customer;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {c ? (
          <div style={{ ...card, padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "13px", color: "#8a7060", textTransform: "uppercase", fontWeight: 600 }}>
                Email
              </div>
              <div style={{ fontSize: "16px" }}>{c.email}</div>
            </div>
            <div>
              <div style={{ fontSize: "13px", color: "#8a7060", textTransform: "uppercase", fontWeight: 600 }}>
                Phone
              </div>
              <div style={{ fontSize: "16px" }}>{c.phone || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: "13px", color: "#8a7060", textTransform: "uppercase", fontWeight: 600 }}>
                Place
              </div>
              <div style={{ fontSize: "16px" }}>{c.place || "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: "13px", color: "#8a7060", textTransform: "uppercase", fontWeight: 600 }}>
                Country
              </div>
              <div style={{ fontSize: "16px" }}>{c.country || "—"}</div>
            </div>
          </div>
        ) : null}

        {ordersErr ? (
          <p style={{ color: "#dc2626", fontSize: "16px" }} role="alert">
            {ordersErr}
          </p>
        ) : null}

        <div style={{ ...card, overflowX: "auto" }}>
          {ordersLoading && !ordersData ? (
            <p style={{ padding: 24, color: "#8a7060" }}>Loading orders…</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  {["Order", "Items", "Amount", "Status", "Place", "Date"].map((h) => (
                    <th key={h} style={thSt}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(ordersData?.items ?? []).map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => {
                      const href = `/admin/orders/${o.id}`;
                      nav?.beginNavigation(href);
                      router.push(href);
                    }}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--admin-row-hover, #faf5ec)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <td style={{ ...tdSt, fontWeight: 600, color: "#b98a3e" }}>{o.orderNumber}</td>
                    <td style={tdSt}>{o.itemCount}</td>
                    <td style={tdSt}>{formatMinorFromPaise(o.grandTotalInPaise, o.currency)}</td>
                    <td style={tdSt}>
                      {formatAdminOrderStatusLabel(o.status, o.paymentStatus, o.paymentProvider)}
                    </td>
                    <td style={tdSt}>{o.place || "—"}</td>
                    <td style={tdSt}>
                      {new Date(o.placedAt ?? o.createdAt).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
                {(ordersData?.items.length ?? 0) === 0 && !ordersLoading ? (
                  <tr>
                    <td colSpan={6} style={{ ...tdSt, textAlign: "center", color: "#8a7060" }}>
                      No orders for this customer
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
        {ordersData ? (
          <AdminPagination
            page={ordersPage}
            totalPages={ordersData.pagination.totalPages}
            total={ordersData.pagination.total}
            itemLabel="orders"
            onPrev={() => setOrdersPage((p) => Math.max(1, p - 1))}
            onNext={() => setOrdersPage((p) => Math.min(ordersData.pagination.totalPages, p + 1))}
          />
        ) : null}
      </div>
    );
  }

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
                  <th style={thSt} />
                  {["Email", "Name", "Phone", "Place", "Country", "Orders", "Joined"].map((h) => (
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
                      onClick={() => {
                        setSelectedId(u.id);
                        setOrdersPage(1);
                      }}
                      style={{ cursor: "pointer" }}
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
                            justifyContent: "center"
                          }}
                          aria-hidden
                        >
                          {initial}
                        </div>
                      </td>
                      <td style={{ ...tdSt, fontWeight: 500, color: "#2c2420" }}>{u.email}</td>
                      <td style={tdSt}>{u.name ?? "—"}</td>
                      <td style={tdSt}>{u.phone ?? "—"}</td>
                      <td style={tdSt}>{u.place ?? "—"}</td>
                      <td style={tdSt}>{u.country ?? "—"}</td>
                      <td style={{ ...tdSt, fontWeight: 600 }}>{u.orderCount}</td>
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
          <p style={{ color: "#8a7060", textAlign: "center", padding: "40px 16px" }}>Loading customers…</p>
        )
      )}
    </div>
  );
}
