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
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

const thSt: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#8a7060",
  background: "#f9f7f4",
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
    <span style={{ color: "#c8960a", letterSpacing: "1px" }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ opacity: i < value ? 1 : 0.25 }}>
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
      <div>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#2c2420" }}>Reviews</h1>
        <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "4px" }}>
          {reviews.length} pending approval
        </p>
      </div>

      {err && (
        <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">
          {err}
        </p>
      )}

      {loading ? (
        <p style={{ color: "#8a7060" }}>Loading...</p>
      ) : (
        <div style={{ ...card, overflow: "hidden" }}>
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
                      (e.currentTarget as HTMLElement).style.background = "#faf8f5";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <td style={tdSt}>
                      <Link
                        href={`/product/${r.product.slug}`}
                        style={{ fontWeight: 600, color: "#2c2420", textDecoration: "none" }}
                      >
                        {r.product.name}
                      </Link>
                      {r.isVerified && (
                        <p style={{ fontSize: "11px", color: "#166534", marginTop: "4px" }}>
                          Verified purchase
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
                        <p style={{ fontSize: "12px", color: "#6b5c52", lineHeight: 1.55 }}>
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
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#166534",
                          background: "none",
                          border: "none",
                          cursor: acting === r.id ? "wait" : "pointer",
                          padding: 0
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={acting === r.id}
                        onClick={() => void reject(r.id)}
                        style={{
                          fontSize: "13px",
                          color: "#8a7060",
                          background: "none",
                          border: "none",
                          cursor: acting === r.id ? "wait" : "pointer",
                          marginLeft: "14px",
                          padding: 0
                        }}
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
                {reviews.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "#8a7060",
                        fontSize: "13px"
                      }}
                    >
                      No reviews awaiting approval.
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
