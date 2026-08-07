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

const ACTION_ICONS: Record<string, string> = {
  CREATE: "✚",
  UPDATE: "✎",
  DELETE: "✕",
  LOGIN: "→",
  LOGOUT: "←",
  REFUND: "↩",
  CANCEL: "⊗",
  APPROVE: "✓",
  REJECT: "✗"
};

const AREA_ICONS: Record<string, string> = {
  products: "📦",
  orders: "🛒",
  inventory: "📋",
  auth: "🔑",
  shipping: "🚚",
  content: "📄",
  coupons: "🎟️",
  customers: "👥",
  reviews: "⭐",
  courses: "📚",
  "pickup-locations": "📍"
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
  let border = "1px solid transparent";
  if (a === "CREATE" || a === "LOGIN") {
    bg = "#dcfce7";
    color = "#166534";
    border = "1px solid rgba(34,197,94,0.3)";
  } else if (a === "UPDATE" || a === "APPROVE") {
    bg = "#dbeafe";
    color = "#1e40af";
    border = "1px solid rgba(59,130,246,0.3)";
  } else if (a === "DELETE" || a === "CANCEL" || a === "LOGOUT") {
    bg = "#fee2e2";
    color = "#991b1b";
    border = "1px solid rgba(239,68,68,0.3)";
  } else if (a === "REFUND" || a === "REJECT") {
    bg = "#fef3c7";
    color = "#92400e";
    border = "1px solid rgba(245,158,11,0.3)";
  }
  return (
    <span
      style={{
        background: bg,
        color,
        border,
        fontSize: "10px",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: "999px"
      }}
    >
      {ACTION_ICONS[a] ?? ""} {action}
    </span>
  );
}

function focusGold(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = "#b98a3e";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(185,138,62,0.10)";
}
function blurGold(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = "#e0d8ce";
  e.currentTarget.style.boxShadow = "none";
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
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec", margin: 0 }}>🛡️ Admin activity</h1>
          <p style={{ fontSize: "13px", color: "#a8c4b0", marginTop: "4px" }}>
            Super-admin only. Login/logout and successful create / update / delete actions across the
            admin backend.
          </p>
        </div>
        <span
          style={{
            background: "rgba(185,138,62,0.2)",
            color: "#f6c95a",
            borderRadius: "999px",
            padding: "4px 12px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase"
          }}
        >
          Super admin only
        </span>
      </div>

      {err ? (
        <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">
          {err}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {[7, 14, 30].map((d) => {
          const active = days === d;
          return (
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
                borderColor: active ? "#1c352a" : "#e0d8ce",
                background: active
                  ? "linear-gradient(135deg, #1c352a, #2d5040)"
                  : "#fff",
                color: active ? "#fffbf5" : "#6b5c52",
                boxShadow: active ? "0 2px 6px rgba(28,53,42,0.25)" : "none",
                transition: "all 0.15s"
              }}
              onMouseEnter={(e) => {
                if (active) return;
                e.currentTarget.style.background = "#faf5ec";
                e.currentTarget.style.borderColor = "#b98a3e";
              }}
              onMouseLeave={(e) => {
                if (active) return;
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.borderColor = "#e0d8ce";
              }}
            >
              📅 Last {d} days
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px"
        }}
      >
        <div style={{ ...card, borderTop: "3px solid #b98a3e" }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#6b5c52"
            }}
          >
            Events
          </p>
          <p style={{ fontSize: "2rem", fontWeight: 800, color: "#2c2420", marginTop: "6px" }}>
            {dash?.total ?? "—"}
          </p>
        </div>
        {(dash?.byActor ?? []).slice(0, 3).map((a) => {
          const initial = (a.name || a.email).charAt(0).toUpperCase();
          return (
            <div key={a.userId} style={{ ...card, borderTop: "3px solid rgba(185,138,62,0.3)" }}>
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
                  marginBottom: "8px"
                }}
                aria-hidden
              >
                {initial}
              </div>
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
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }} className="max-md:!grid-cols-1">
        <div style={{ ...card, borderTop: "3px solid rgba(185,138,62,0.2)", boxShadow: "0 4px 16px rgba(28,53,42,0.07)" }}>
          <h3
            style={{
              fontSize: "15px",
              fontWeight: 800,
              color: "#2c2420",
              marginBottom: "10px",
              borderLeft: "3px solid #b98a3e",
              paddingLeft: "10px"
            }}
          >
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
        <div style={{ ...card, borderTop: "3px solid rgba(185,138,62,0.2)", boxShadow: "0 4px 16px rgba(28,53,42,0.07)" }}>
          <h3
            style={{
              fontSize: "15px",
              fontWeight: 800,
              color: "#2c2420",
              marginBottom: "10px",
              borderLeft: "3px solid #b98a3e",
              paddingLeft: "10px"
            }}
          >
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
                <span style={{ textTransform: "capitalize" }}>
                  {AREA_ICONS[r.resource] ?? "⚙️"} {r.resource.replace(/_/g, " ")}
                </span>
                <span style={{ fontWeight: 600, color: "#2c2420" }}>{r.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div
        style={{
          ...card,
          borderLeft: "3px solid rgba(185,138,62,0.2)",
          boxShadow: "0 4px 16px rgba(28,53,42,0.06)"
        }}
      >
        <h3
          style={{
            fontSize: "15px",
            fontWeight: 800,
            color: "#2c2420",
            marginBottom: "12px",
            borderLeft: "3px solid #b98a3e",
            paddingLeft: "10px"
          }}
        >
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
              onFocus={focusGold}
              onBlur={blurGold}
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
                outline: "none"
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
              onFocus={focusGold}
              onBlur={blurGold}
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
                outline: "none"
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
              onFocus={focusGold}
              onBlur={blurGold}
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
                outline: "none"
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
              onBlur={(e) => {
                blurGold(e);
                setPage(1);
              }}
              onFocus={focusGold}
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
                boxSizing: "border-box",
                outline: "none"
              }}
            />
          </label>
        </div>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#8a7060" }}>
            <span style={{ fontSize: "18px" }}>🛡️</span>
            <span style={{ fontSize: "13px" }}>Loading activity…</span>
          </div>
        ) : items.length === 0 ? (
          <p style={{ color: "#8a7060", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>🛡️</span>
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
                        background: "linear-gradient(180deg, #f2ede5, #f9f7f4)"
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const initial = (row.actorName || row.actorEmail).charAt(0).toUpperCase();
                  return (
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
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span
                            style={{
                              width: "28px",
                              height: "28px",
                              borderRadius: "50%",
                              background: "linear-gradient(135deg, #1c352a, #2d5040)",
                              color: "#faf5ec",
                              fontSize: "11px",
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              marginRight: "8px",
                              flexShrink: 0
                            }}
                            aria-hidden
                          >
                            {initial}
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, color: "#1c352a" }}>{row.actorName || "—"}</div>
                            <div style={{ fontSize: "11px", color: "#8a7060" }}>{row.actorEmail}</div>
                          </div>
                        </div>
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
                        {AREA_ICONS[row.resource] ?? "⚙️"} {row.resource.replace(/_/g, " ")}
                      </td>
                      <td style={{ padding: "12px", fontSize: "13px", color: "#4a3f38", maxWidth: 320 }}>
                        {row.summary}
                      </td>
                      <td style={{ padding: "12px", fontSize: "11px", color: "#8a7060" }}>
                        {row.ip || "—"}
                      </td>
                    </tr>
                  );
                })}
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
                opacity: page <= 1 ? 0.5 : 1,
                fontWeight: 600,
                transition: "all 0.15s"
              }}
              onMouseEnter={(e) => {
                if (page <= 1) return;
                e.currentTarget.style.background = "#faf5ec";
                e.currentTarget.style.borderColor = "#b98a3e";
              }}
              onMouseLeave={(e) => {
                if (page <= 1) return;
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.borderColor = "#e0d8ce";
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
                border: "none",
                background:
                  page >= totalPages
                    ? "#f4f1ec"
                    : "linear-gradient(135deg, #1c352a, #2d5040)",
                color: page >= totalPages ? "#c8bca8" : "#fffbf5",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                opacity: page >= totalPages ? 0.5 : 1,
                fontWeight: 600,
                boxShadow: page >= totalPages ? "none" : "0 2px 6px rgba(28,53,42,0.2)",
                transition: "all 0.15s"
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
