"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PendingReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerified: boolean;
  createdAt: string;
  product: { name: string; slug: string };
  user: { name: string | null; email: string };
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "14px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 4px 20px rgba(28,53,42,0.08)",
  overflow: "hidden"
};

const thSt: React.CSSProperties = {
  padding: "13px 14px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8a7060",
  background: "linear-gradient(180deg, #f2ede5, #f9f7f4)",
  textAlign: "left"
};

const tdSt: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: "13px",
  color: "#4a3f38",
  borderBottom: "1px solid #f0ece6",
  verticalAlign: "top"
};

function Stars({ value }: { value: number }) {
  return (
    <span style={{ color: "#b98a3e", letterSpacing: "2px" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            opacity: i < value ? 1 : 0.2,
            textShadow: i < value ? "0 1px 3px rgba(185,138,62,0.4)" : undefined
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/reviews/admin/pending", { credentials: "include" });
      const data = (await res.json()) as { reviews?: PendingReview[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load reviews");
      setReviews(data.reviews ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load reviews");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    setActing(id);
    try {
      const res = await fetch(`/api/reviews/admin/${id}/approve`, {
        method: "PATCH",
        credentials: "include"
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Approve failed");
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActing(null);
    }
  }

  async function reject(id: string) {
    if (!confirm("Reject and delete this review?")) return;
    setActing(id);
    try {
      const res = await fetch(`/api/reviews/admin/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Reject failed");
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActing(null);
    }
  }

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
          <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec", margin: 0 }}>⭐ Reviews</h1>
        </div>
        <span
          style={{
            background: reviews.length > 0 ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.2)",
            color: reviews.length > 0 ? "#f6c95a" : "#86efac",
            borderRadius: "999px",
            padding: "4px 12px",
            fontSize: "12px",
            fontWeight: 700
          }}
        >
          {reviews.length > 0 ? `${reviews.length} pending` : "✓ All clear"}
        </span>
      </div>

      {err && (
        <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">
          {err}
        </p>
      )}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#8a7060", padding: "40px 16px", justifyContent: "center" }}>
          <span style={{ fontSize: "24px" }}>⭐</span>
          <span style={{ fontSize: "14px" }}>Loading reviews…</span>
        </div>
      ) : (
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                  {["Product", "Customer", "Rating", "Review", "Date", ""].map((h) => (
                    <th key={h} style={thSt}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr
                    key={r.id}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "#faf5ec";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                    style={{ transition: "background 0.15s" }}
                  >
                    <td style={tdSt}>
                      <Link
                        href={`/product/${r.product.slug}`}
                        style={{ fontWeight: 700, color: "#1c352a", textDecoration: "none" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#b98a3e"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "#1c352a"; }}
                      >
                        {r.product.name}
                      </Link>
                      {r.isVerified && (
                        <p
                          style={{
                            marginTop: "6px",
                            background: "#dcfce7",
                            color: "#166534",
                            borderRadius: "999px",
                            padding: "2px 8px",
                            fontSize: "11px",
                            fontWeight: 700,
                            border: "1px solid rgba(34,197,94,0.2)",
                            display: "inline-block"
                          }}
                        >
                          ✓ Verified purchase
                        </p>
                      )}
                    </td>
                    <td style={tdSt}>
                      <p style={{ fontWeight: 500, color: "#2c2420" }}>
                        {r.user.name || "—"}
                      </p>
                      <p style={{ fontSize: "12px", color: "#8a7060", marginTop: "2px" }}>
                        {r.user.email}
                      </p>
                    </td>
                    <td style={tdSt}>
                      <Stars value={r.rating} />
                    </td>
                    <td style={{ ...tdSt, maxWidth: "320px" }}>
                      {r.title && (
                        <p style={{ fontWeight: 600, color: "#2c2420", marginBottom: "4px" }}>
                          {r.title}
                        </p>
                      )}
                      {r.body ? (
                        <p
                          style={{
                            fontSize: "12px",
                            color: "#4a3f38",
                            lineHeight: 1.55,
                            borderLeft: "2px solid #e8e2d9",
                            paddingLeft: "8px"
                          }}
                        >
                          {r.body}
                        </p>
                      ) : (
                        <span style={{ color: "#8a7060" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdSt, fontSize: "12px", color: "#8a7060", whiteSpace: "nowrap" }}>
                      {new Date(r.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                      })}
                    </td>
                    <td style={{ ...tdSt, whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        disabled={acting === r.id}
                        onClick={() => void approve(r.id)}
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#166534",
                          background: "#dcfce7",
                          border: "1px solid rgba(34,197,94,0.3)",
                          borderRadius: "8px",
                          padding: "5px 12px",
                          cursor: acting === r.id ? "wait" : "pointer",
                          transition: "all 0.15s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#16a34a";
                          e.currentTarget.style.color = "#fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#dcfce7";
                          e.currentTarget.style.color = "#166534";
                        }}
                      >
                        ✓ Approve
                      </button>
                      <button
                        type="button"
                        disabled={acting === r.id}
                        onClick={() => void reject(r.id)}
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#dc2626",
                          background: "#fff0f0",
                          border: "1px solid rgba(220,38,38,0.2)",
                          borderRadius: "8px",
                          padding: "5px 12px",
                          cursor: acting === r.id ? "wait" : "pointer",
                          marginLeft: "8px",
                          transition: "all 0.15s"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#dc2626";
                          e.currentTarget.style.color = "#fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#fff0f0";
                          e.currentTarget.style.color = "#dc2626";
                        }}
                      >
                        ✗ Reject
                      </button>
                    </td>
                  </tr>
                ))}
                {reviews.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "60px 40px", textAlign: "center" }}>
                      <div style={{ fontSize: "48px", marginBottom: "12px" }}>⭐</div>
                      <p style={{ fontSize: "15px", fontWeight: 700, color: "#1c352a" }}>
                        All caught up!
                      </p>
                      <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
                        No reviews awaiting approval right now.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
