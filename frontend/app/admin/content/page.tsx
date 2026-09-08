"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { useAdminNavOptional } from "@/components/admin/AdminNavContext";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import { ADMIN_CONTENT_LABELS, ADMIN_CONTENT_TYPES, type AdminContentRow, type AdminContentType, deleteAdminContent, fetchAdminContentList } from "@/lib/admin-api";

function parseType(raw: string | null): AdminContentType {
  if (raw && (ADMIN_CONTENT_TYPES as readonly string[]).includes(raw)) return raw as AdminContentType;
  return "pages";
}

const CONTENT_TYPE_ICONS: Record<string, string> = {
  pages: "📄",
  courses: "📚",
  events: "🎉",
  blog: "✍️",
  mentors: "🧘",
  vaidyas: "🌿",
  retreats: "🏔️",
  offers: "🏷️",
  testimonials: "💬",
  directory: "📋"
};

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

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const styles =
    s === "PUBLISHED"
      ? { bg: "#dcfce7", color: "#166534", border: "1px solid rgba(34,197,94,0.2)", dot: "#16a34a" }
      : s === "DRAFT"
        ? { bg: "#fef3c7", color: "#92400e", border: "1px solid rgba(245,158,11,0.2)", dot: "#d97706" }
        : { bg: "#f3f4f6", color: "#374151", border: "1px solid transparent", dot: "#9ca3af" };
  return (
    <span
      style={{
        background: styles.bg,
        color: styles.color,
        border: styles.border,
        fontSize: "14px",
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: "999px",
        display: "inline-flex",
        alignItems: "center"
      }}
    >
      <span style={{ color: styles.dot, marginRight: "5px" }}>●</span>
      {status}
    </span>
  );
}

function AdminContentList() {
  const router = useRouter();
  const nav = useAdminNavOptional();
  const searchParams = useSearchParams();
  const type = parseType(searchParams.get("type"));
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminContentRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 24, total: 0, totalPages: 1 });
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await fetchAdminContentList(type, { q: q || undefined, page, limit: 24 });
      setItems(data.items);
      setPagination(data.pagination);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setItems([]);
    }
  }, [type, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function setType(next: AdminContentType) {
    setPage(1);
    router.replace(`/admin/content?type=${next}`);
  }

  function openRow(row: AdminContentRow) {
    const href = `/admin/content/${type}/${row.id}`;
    nav?.beginNavigation(href);
    router.push(href);
  }

  async function deactivate(row: AdminContentRow) {
    if (!confirm(`Deactivate "${row.title}"?`)) return;
    setBusyId(row.id);
    try {
      await deleteAdminContent(type, row.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deactivate failed");
    } finally {
      setBusyId(null);
    }
  }

  useAdminPageHeader(
    () => ({
      title: "Content",
      icon: "📄",
      subtitle: <>Pages, courses, events, blog, and directory entries.</>,
      actions: (
        <Link
          href={`/admin/content/${type}/new`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 12px",
            borderRadius: "999px",
            textDecoration: "none",
            color: "#fff",
            background: "linear-gradient(135deg, #b98a3e, #c8960a)",
            fontSize: "13px",
            fontWeight: 700,
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap"
          }}
        >
          + Add {ADMIN_CONTENT_LABELS[type].slice(0, -1).toLowerCase()}
        </Link>
      )
    }),
    [type]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {ADMIN_CONTENT_TYPES.map((t) => {
          const active = t === type;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              style={{
                padding: "7px 14px",
                borderRadius: "999px",
                fontSize: "16px",
                fontWeight: 500,
                cursor: "pointer",
                border: "1px solid",
                borderColor: active ? "#1e3a2f" : "var(--admin-card-border, #e8e2d9)",
                background: active
                  ? "linear-gradient(135deg, #1c352a, #2d5040)"
                  : "var(--admin-card-bg, #fff)",
                color: active ? "#fffbf5" : "#6b5c52",
                transition: "all 0.15s",
                boxShadow: active ? "0 2px 8px rgba(28,53,42,0.20)" : "none"
              }}
            >
              {CONTENT_TYPE_ICONS[t] ?? "📄"} {ADMIN_CONTENT_LABELS[t]}
            </button>
          );
        })}
      </div>

      <div
        style={{
          ...card,
          padding: "12px 14px",
          display: "flex",
          gap: "8px",
          alignItems: "flex-end",
          flexWrap: "wrap"
        }}
      >
        <div style={{ flex: "1 1 180px", minWidth: "140px" }}>
          <label htmlFor="content-q" style={labelSt}>
            Search
          </label>
          <input
            id="content-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setPage(1)}
            placeholder="Title or name..."
            style={inputSt}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            if (page === 1) void load();
            else setPage(1);
          }}
          style={{
            padding: "7px 12px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #1c352a, #2d5040)",
            color: "#fffbf5",
            fontSize: "15px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(28,53,42,0.18)"
          }}
        >
          Apply
        </button>
      </div>

      {err && (
        <p style={{ color: "#dc2626", fontSize: "16px" }} role="alert">
          {err}
        </p>
      )}

      <div style={{ ...card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #f0ece6" }}>
              {["Title", "Slug", "Status", "Updated", "Actions"].map((h) => (
                <th key={h} style={thSt}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={row.id}
                onClick={() => openRow(row)}
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--admin-row-hover, #faf5ec)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "";
                }}
              >
                <td style={{ ...tdSt, fontWeight: 700, color: "#1c352a" }}>{row.title}</td>
                <td
                  style={{
                    ...tdSt,
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: "14px",
                    color: "#b98a3e"
                  }}
                >
                  {row.slug}
                </td>
                <td style={tdSt}>
                  <StatusBadge status={row.status} />
                </td>
                <td style={{ ...tdSt, color: "#8a7060", whiteSpace: "nowrap" }}>
                  {new Date(row.updatedAt).toLocaleString("en-IN")}
                </td>
                <td style={{ ...tdSt, whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/admin/content/${type}/${row.id}`}
                    style={{
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#b98a3e",
                      textDecoration: "none"
                    }}
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void deactivate(row)}
                    style={{
                      marginLeft: "16px",
                      fontSize: "15px",
                      color: "#8a7060",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      opacity: busyId === row.id ? 0.4 : 1
                    }}
                  >
                    {busyId === row.id ? "…" : "Deactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "40px 16px", textAlign: "center", color: "#6b7280", fontSize: "16px" }}>
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        itemLabel={ADMIN_CONTENT_LABELS[type].toLowerCase()}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
      />
    </div>
  );
}

export default function AdminContentPage() {
  return (
    <Suspense fallback={<p style={{ color: "#8a7060" }}>Loading content...</p>}>
      <AdminContentList />
    </Suspense>
  );
}
