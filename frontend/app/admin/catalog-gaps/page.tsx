"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchCatalogGaps, type CatalogGapsReport } from "@/lib/admin-api";

const card: React.CSSProperties = { background: "var(--admin-card-bg, #fff)", borderRadius: "12px", border: "1px solid var(--admin-card-border, #e8e2d9)", boxShadow: "0 1px 4px rgba(44,36,32,0.06)" };
const thSt: React.CSSProperties = { padding: "9px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--admin-text-muted, #8a7060)", background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))", textAlign: "left", position: "sticky" as const, top: 0 };
const tdSt: React.CSSProperties = { padding: "10px 14px", fontSize: "13px", color: "var(--admin-text, #4a3f38)", borderBottom: "1px solid var(--admin-card-border, #f0ece6)" };
const sectionH2: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--admin-text, #2c2420)",
  marginBottom: "10px",
  borderLeft: "3px solid #b98a3e",
  paddingLeft: "10px"
};

function GapTable({ rows, editHref }: { rows: CatalogGapsReport["pricingGaps"]; editHref: (id: string) => string }) {
  if (rows.length === 0) return <p style={{ fontSize: "13px", color: "var(--admin-text-muted, #8a7060)", padding: "16px" }}>No gaps in this category.</p>;
  return (
    <div style={{ maxHeight: "320px", overflowY: "auto", ...card }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Product","SKU","Issue",""].map((h) => <th key={h} style={thSt}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.variantId}-${i}`}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#faf5ec";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <td style={tdSt}><p style={{ fontWeight: 600, color: "var(--admin-text, #2c2420)" }}>{r.productName}</p><p style={{ fontSize: "11px", color: "var(--admin-text-muted, #8a7060)" }}>{r.productSlug}</p></td>
              <td style={{ ...tdSt, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: "12px" }}>{r.sku}</td>
              <td style={{ ...tdSt, color: "#6b5c52" }}>{r.issue}{r.zone ? ` (${r.zone})` : ""}</td>
              <td style={tdSt}><Link href={editHref(r.productId)} style={{ fontSize: "12px", fontWeight: 600, color: "#b98a3e", textDecoration: "none", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Fix →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CatalogGapsPage() {
  const [report, setReport] = useState<CatalogGapsReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setReport(await fetchCatalogGaps()); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{
        background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
        borderRadius: "16px",
        padding: "22px 28px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "16px"
      }}>
        <div>
          <Link
            href="/admin/products"
            style={{ fontSize: "12px", color: "#a8c4b0", textDecoration: "none", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}
          >← Products</Link>
          <h1 style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "-0.02em", color: "#faf5ec", marginTop: "6px" }}>🔍 Catalog &amp; Payment Gaps</h1>
          <p style={{ fontSize: "13px", color: "#a8c4b0", marginTop: "4px" }}>Missing prices, shipping rows, and payment gateway config.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            height: "40px",
            padding: "0 20px",
            borderRadius: "8px",
            background: "rgba(255,255,255,0.12)",
            color: "#faf5ec",
            fontSize: "13px",
            fontWeight: 600,
            border: "1px solid rgba(255,255,255,0.2)",
            cursor: "pointer",
            transition: "all 0.15s ease"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
        >
          ↻ Refresh
        </button>
      </div>

      {loading && <p style={{ color: "var(--admin-text-muted, #8a7060)" }}>Loading...</p>}
      {err && <p style={{ color: "#dc2626" }} role="alert">{err}</p>}

      {report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px" }}>
            {[
              { label: "Pricing gaps", value: report.summary.pricingGapCount, warn: report.summary.pricingGapCount > 0 },
              { label: "Shipping gaps", value: report.summary.shippingGapCount, warn: report.summary.shippingGapCount > 0 },
              { label: "No primary image", value: report.summary.productsWithoutImage, warn: report.summary.productsWithoutImage > 0 },
              { label: "Active variants", value: report.summary.activeVariants, warn: false },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  ...card,
                  padding: "16px 18px",
                  borderColor: item.warn ? "#fde68a" : "var(--admin-card-border, #e8e2d9)",
                  background: item.warn ? "linear-gradient(135deg, #fffbf0, #fef9e7)" : "var(--admin-card-bg, #fff)",
                  borderLeft: item.warn ? "3px solid #f59e0b" : "3px solid #1c352a"
                }}
              >
                <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--admin-text-muted, #8a7060)", marginBottom: "6px" }}>{item.label}</p>
                <p style={{ fontSize: "1.8rem", fontWeight: 800, color: item.warn ? "#92400e" : "#2c2420" }}>{item.value}</p>
              </div>
            ))}
          </div>

          <div style={{ ...card, padding: "18px 22px" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--admin-text, #2c2420)", marginBottom: "12px" }}>Payment Gateways</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {([["Razorpay (India)", report.summary.payment.razorpay],["COD", report.summary.payment.cod],["Stripe", report.summary.payment.stripe],["PayPal", report.summary.payment.paypal]] as const).map(([label, ok]) => (
                <span
                  key={label}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background: ok ? "#dcfce7" : "#fee2e2",
                    color: ok ? "#166534" : "#991b1b",
                    border: ok ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(239,68,68,0.2)"
                  }}
                >
                  <span style={{ color: ok ? "#166534" : "#991b1b", marginRight: "4px" }}>●</span>
                  {label}: {ok ? "✓ configured" : "✗ missing"}
                </span>
              ))}
            </div>
          </div>

          <section><h2 style={sectionH2}>Pricing Gaps</h2><GapTable rows={report.pricingGaps} editHref={(id) => `/admin/products/${id}`} /></section>
          <section><h2 style={sectionH2}>Shipping Gaps</h2><GapTable rows={report.shippingGaps} editHref={(id) => `/admin/products/${id}`} /></section>

          {report.productsWithoutPrimaryImage.length > 0 && (
            <section>
              <h2 style={sectionH2}>Products Without Primary Image</h2>
              <div style={{ ...card, padding: "16px 20px" }}>
                <ul style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {report.productsWithoutPrimaryImage.map((p) => (
                    <li key={p.productId} style={{ fontSize: "13px" }}>
                      <Link
                        href={`/admin/products/${p.productId}`}
                        style={{ color: "#b98a3e", textDecoration: "none", fontWeight: 500 }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = "underline";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = "none";
                        }}
                      >
                        {p.name}
                      </Link>
                      <span style={{ color: "var(--admin-text-muted, #8a7060)" }}> — {p.slug}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
