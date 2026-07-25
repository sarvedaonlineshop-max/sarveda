"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useIsSuperAdmin } from "@/components/admin/AdminUserContext";
import {
  fetchAdminActivityDashboard,
  fetchAdminActivityList,
  type AdminActivityDashboardData,
  type AdminActivityItem
} from "@/lib/admin-api";

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)",
  padding: "18px 20px"
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  });
}

function ActionPill({ action }: { action: string }) {
  const a = action.toUpperCase();
  let bg = "#f3f4f6";
  let color = "#374151";
  if (a === "CREATE" || a === "LOGIN") {
    bg = "#dcfce7";
    color = "#166534";
  } else if (a === "UPDATE" || a === "APPROVE") {
    bg = "#dbeafe";
    color = "#1e40af";
  } else if (a === "DELETE" || a === "CANCEL" || a === "LOGOUT") {
    bg = "#fee2e2";
    color = "#991b1b";
  } else if (a === "REFUND" || a === "REJECT") {
    bg = "#fef3c7";
    color = "#92400e";
  }
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: "999px"
      }}
    >
      {action}
    </span>
  );
}

export default function AdminActivityPage() {
  const isSuper = useIsSuperAdmin();
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [dash, setDash] = useState<AdminActivityDashboardData | null>(null);
  const [items, setItems] = useState<AdminActivityItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actorUserId, setActorUserId] = useState("");
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSuper) {
      router.replace("/admin");
    }
  }, [isSuper, router]);

  useEffect(() => {
    if (!isSuper) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchAdminActivityDashboard(days),
      fetchAdminActivityList({
        page,
        limit: 30,
        actorUserId: actorUserId || undefined,
        resource: resource || undefined,
        action: action || undefined,
        q: q || undefined
      })
    ])
      .then(([d, list]) => {
        if (cancelled) return;
        setDash(d);
        setItems(list.items);
        setTotalPages(list.pagination.totalPages);
        setTotal(list.pagination.total);
        setErr(null);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load activity");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuper, days, page, actorUserId, resource, action, q]);

  if (!isSuper) {
    return <p style={{ color: "#8a7060" }}>Redirecting…</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Admin activity</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          Super-admin only. Login/logout and successful create / update / delete actions across the
          admin backend.
        </p>
      </div>

      {err ? (
        <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">
          {err}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setDays(d);
              setPage(1);
            }}
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid",
              borderColor: days === d ? "#1e3a2f" : "#e0d8ce",
              background: days === d ? "#1e3a2f" : "#fff",
              color: days === d ? "#fffbf5" : "#6b5c52"
            }}
          >
            Last {d} days
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px"
        }}
      >
        <div style={card}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#8a7060"
            }}
          >
            Events
          </p>
          <p style={{ fontSize: "1.6rem", fontWeight: 700, color: "#2c2420", marginTop: "6px" }}>
            {dash?.total ?? "—"}
          </p>
        </div>
        {(dash?.byActor ?? []).slice(0, 3).map((a) => (
          <div key={a.userId} style={card}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#8a7060",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {a.name || a.email}
            </p>
            <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#2c2420", marginTop: "6px" }}>
              {a.count}
            </p>
            <p style={{ fontSize: "11px", color: "#8a7060" }}>{a.email}</p>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }} className="max-md:!grid-cols-1">
        <div style={card}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#2c2420", marginBottom: "10px" }}>
            By action
          </h3>
          {(dash?.byAction ?? []).length === 0 ? (
            <p style={{ fontSize: "13px", color: "#8a7060" }}>No data yet</p>
          ) : (
            (dash?.byAction ?? []).map((r) => (
              <div
                key={r.action}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid #f0ece6",
                  fontSize: "13px"
                }}
              >
                <ActionPill action={r.action} />
                <span style={{ fontWeight: 600, color: "#2c2420" }}>{r.count}</span>
              </div>
            ))
          )}
        </div>
        <div style={card}>
          <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#2c2420", marginBottom: "10px" }}>
            By area
          </h3>
          {(dash?.byResource ?? []).length === 0 ? (
            <p style={{ fontSize: "13px", color: "#8a7060" }}>No data yet</p>
          ) : (
            (dash?.byResource ?? []).map((r) => (
              <div
                key={r.resource}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid #f0ece6",
                  fontSize: "13px",
                  color: "#4a3f38"
                }}
              >
                <span style={{ textTransform: "capitalize" }}>{r.resource.replace(/_/g, " ")}</span>
                <span style={{ fontWeight: 600, color: "#2c2420" }}>{r.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#2c2420", marginBottom: "12px" }}>
          Filter by admin
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "10px",
            marginBottom: "16px"
          }}
        >
          <label style={{ fontSize: "12px", color: "#8a7060" }}>
            Admin
            <select
              value={actorUserId}
              onChange={(e) => {
                setActorUserId(e.target.value);
                setPage(1);
              }}
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                height: "38px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                padding: "0 10px",
                background: "#fff",
                color: "#2c2420"
              }}
            >
              <option value="">All admins</option>
              {(dash?.admins ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.name ? `${a.name} — ` : "") + a.email}
                  {a.role === "SUPER_ADMIN" ? " (super)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "12px", color: "#8a7060" }}>
            Area
            <select
              value={resource}
              onChange={(e) => {
                setResource(e.target.value);
                setPage(1);
              }}
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                height: "38px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                padding: "0 10px",
                background: "#fff",
                color: "#2c2420"
              }}
            >
              <option value="">All areas</option>
              {(dash?.byResource ?? []).map((r) => (
                <option key={r.resource} value={r.resource}>
                  {r.resource}
                </option>
              ))}
              {["auth", "products", "orders", "shipping", "inventory", "content", "coupons"].map(
                (r) =>
                  !(dash?.byResource ?? []).some((x) => x.resource === r) ? (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ) : null
              )}
            </select>
          </label>
          <label style={{ fontSize: "12px", color: "#8a7060" }}>
            Action
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                height: "38px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                padding: "0 10px",
                background: "#fff",
                color: "#2c2420"
              }}
            >
              <option value="">All actions</option>
              {["LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE", "REFUND", "CANCEL", "APPROVE"].map(
                (a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                )
              )}
            </select>
          </label>
          <label style={{ fontSize: "12px", color: "#8a7060" }}>
            Search
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => setPage(1)}
              placeholder="email, summary, id…"
              style={{
                display: "block",
                width: "100%",
                marginTop: "4px",
                height: "38px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                padding: "0 10px",
                background: "#fff",
                color: "#2c2420",
                boxSizing: "border-box"
              }}
            />
          </label>
        </div>

        {loading ? (
          <p style={{ color: "#8a7060", fontSize: "13px" }}>Loading…</p>
        ) : items.length === 0 ? (
          <p style={{ color: "#8a7060", fontSize: "13px" }}>
            No activity yet. History starts as admins log in and make changes.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  {["When", "Admin", "Action", "Area", "Summary", "IP"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 12px",
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#8a7060",
                        textAlign: "left",
                        background: "#f9f7f4"
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f0ece6" }}>
                    <td
                      style={{
                        padding: "12px",
                        fontSize: "12px",
                        color: "#8a7060",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {formatWhen(row.createdAt)}
                    </td>
                    <td style={{ padding: "12px", fontSize: "13px", color: "#2c2420" }}>
                      <div style={{ fontWeight: 600 }}>{row.actorName || "—"}</div>
                      <div style={{ fontSize: "11px", color: "#8a7060" }}>{row.actorEmail}</div>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <ActionPill action={row.action} />
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        fontSize: "12px",
                        color: "#4a3f38",
                        textTransform: "capitalize"
                      }}
                    >
                      {row.resource.replace(/_/g, " ")}
                    </td>
                    <td style={{ padding: "12px", fontSize: "13px", color: "#4a3f38", maxWidth: 320 }}>
                      {row.summary}
                    </td>
                    <td style={{ padding: "12px", fontSize: "11px", color: "#8a7060" }}>
                      {row.ip || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "14px",
            gap: "12px"
          }}
        >
          <p style={{ fontSize: "12px", color: "#8a7060" }}>
            {total} event{total === 1 ? "" : "s"} · page {page} of {totalPages}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                height: "34px",
                padding: "0 12px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                background: "#fff",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                opacity: page <= 1 ? 0.5 : 1
              }}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                height: "34px",
                padding: "0 12px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                background: "#fff",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                opacity: page >= totalPages ? 0.5 : 1
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
