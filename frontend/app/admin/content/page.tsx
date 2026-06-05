"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { ADMIN_CONTENT_LABELS, ADMIN_CONTENT_TYPES, type AdminContentRow, type AdminContentType, deleteAdminContent, fetchAdminContentList } from "@/lib/admin-api";

function parseType(raw: string | null): AdminContentType {
  if (raw && (ADMIN_CONTENT_TYPES as readonly string[]).includes(raw)) return raw as AdminContentType;
  return "pages";
}

const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e8e2d9", boxShadow: "0 1px 4px rgba(44,36,32,0.06)" };
const thSt: React.CSSProperties = { padding: "11px 16px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a7060", background: "#f9f7f4", textAlign: "left" };
const tdSt: React.CSSProperties = { padding: "12px 16px", fontSize: "13px", color: "#4a3f38", borderBottom: "1px solid #f0ece6" };

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const styles = s === "PUBLISHED" ? { bg: "#dcfce7", color: "#166534" } : s === "DRAFT" ? { bg: "#fef3c7", color: "#92400e" } : { bg: "#f3f4f6", color: "#374151" };
  return <span style={{ background: styles.bg, color: styles.color, fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px" }}>{status}</span>;
}

function AdminContentList() {
  const router = useRouter(); const searchParams = useSearchParams();
  const type = parseType(searchParams.get("type"));
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminContentRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 24, total: 0, totalPages: 1 });
  const [err, setErr] = useState<string | null>(null); const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { const data = await fetchAdminContentList(type, { q: q || undefined, page, limit: 24 }); setItems(data.items); setPagination(data.pagination); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); setItems([]); }
  }, [type, q, page]);

  useEffect(() => { void load(); }, [load]);

  function setType(next: AdminContentType) { setPage(1); router.replace(`/admin/content?type=${next}`); }

  async function deactivate(row: AdminContentRow) {
    if (!confirm(`Deactivate "${row.title}"?`)) return;
    setBusyId(row.id);
    try { await deleteAdminContent(type, row.id); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Deactivate failed"); }
    finally { setBusyId(null); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Content</h1>
          <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>Pages, courses, events, blog, and directory entries.</p>
        </div>
        <Link href={`/admin/content/${type}/new`} style={{ height: "40px", padding: "0 20px", borderRadius: "8px", background: "#1e3a2f", color: "#fffbf5", fontSize: "13px", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          + Add {ADMIN_CONTENT_LABELS[type].slice(0, -1).toLowerCase()}
        </Link>
      </div>

      {/* Type tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", borderBottom: "2px solid #e8e2d9", paddingBottom: "0" }}>
        {ADMIN_CONTENT_TYPES.map((t) => (
          <button key={t} type="button" onClick={() => setType(t)}
            style={{ padding: "8px 16px", fontSize: "13px", fontWeight: t === type ? 700 : 400, cursor: "pointer", border: "none", background: "transparent", color: t === type ? "#1e3a2f" : "#8a7060", borderBottom: t === type ? "2px solid #1e3a2f" : "2px solid transparent", marginBottom: "-2px", transition: "all 0.15s" }}>
            {ADMIN_CONTENT_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", ...card, padding: "16px 20px" }}>
        <div style={{ flex: 1 }}>
          <label htmlFor="content-q" style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a7060", display: "block", marginBottom: "6px" }}>Search</label>
          <input id="content-q" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setPage(1)} placeholder="Title or name..."
            style={{ width: "100%", height: "38px", padding: "0 14px", borderRadius: "8px", border: "1px solid #e0d8ce", fontSize: "13px", background: "#fff", color: "#2c2420", outline: "none", boxSizing: "border-box" }} />
        </div>
        <button type="button" onClick={() => { if (page === 1) void load(); else setPage(1); }}
          style={{ height: "38px", padding: "0 20px", borderRadius: "8px", background: "#1e3a2f", color: "#fffbf5", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer" }}>Apply</button>
      </div>

      {err && <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">{err}</p>}

      <div style={{ ...card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "2px solid #f0ece6" }}>
            {["Title","Slug","Status","Updated","Actions"].map((h) => <th key={h} style={thSt}>{h}</th>)}
          </tr></thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#faf8f5"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}>
                <td style={{ ...tdSt, fontWeight: 600, color: "#2c2420" }}>{row.title}</td>
                <td style={{ ...tdSt, fontFamily: "monospace", fontSize: "12px", color: "#8a7060" }}>{row.slug}</td>
                <td style={tdSt}><StatusBadge status={row.status} /></td>
                <td style={{ ...tdSt, fontSize: "12px", color: "#8a7060", whiteSpace: "nowrap" }}>{new Date(row.updatedAt).toLocaleString("en-IN")}</td>
                <td style={{ ...tdSt, whiteSpace: "nowrap" }}>
                  <Link href={`/admin/content/${type}/${row.id}`} style={{ fontSize: "13px", fontWeight: 600, color: "#c8960a", textDecoration: "none" }}>Edit</Link>
                  <button type="button" disabled={busyId === row.id} onClick={() => void deactivate(row)}
                    style={{ marginLeft: "16px", fontSize: "13px", color: "#8a7060", background: "none", border: "none", cursor: "pointer", padding: 0, opacity: busyId === row.id ? 0.4 : 1 }}>
                    {busyId === row.id ? "…" : "Deactivate"}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} style={{ padding: "40px 16px", textAlign: "center", color: "#8a7060", fontSize: "13px" }}>No items yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <AdminPagination page={page} totalPages={pagination.totalPages} total={pagination.total} itemLabel={ADMIN_CONTENT_LABELS[type].toLowerCase()} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} />
    </div>
  );
}

export default function AdminContentPage() {
  return <Suspense fallback={<p style={{ color: "#8a7060" }}>Loading content...</p>}><AdminContentList /></Suspense>;
}
