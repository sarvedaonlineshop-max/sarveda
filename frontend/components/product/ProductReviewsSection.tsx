"use client";

import { useCallback, useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

type Review = {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  createdAt: string;
  isVerified?: boolean;
  user?: { name?: string | null } | null;
};

type Props = { productId: string };

function Stars({
  value,
  interactive = false,
  onSelect
}: {
  value: number;
  interactive?: boolean;
  onSelect?: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const val = i + 1;
        const filled = val <= (interactive ? hover || value : value);
        return (
          <span
            key={val}
            onClick={() => interactive && onSelect?.(val)}
            onMouseEnter={() => interactive && setHover(val)}
            onMouseLeave={() => interactive && setHover(0)}
            style={{
              fontSize: interactive ? "24px" : "16px",
              color: filled ? "#c8960a" : "#e0d8ce",
              cursor: interactive ? "pointer" : "default",
              transition: "color 0.1s"
            }}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}

export function ProductReviewsSection({ productId }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [average, setAverage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/reviews/${productId}`);
      const data = (await res.json()) as {
        reviews: Review[];
        total: number;
        average: number;
      };
      setReviews(data.reviews ?? []);
      setTotal(data.total ?? 0);
      setAverage(data.average ?? 0);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormErr(null);
    try {
      const res = await fetch(`${getApiBase()}/api/reviews/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating, title, body })
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to submit review");
      setSubmitted(true);
      setTitle("");
      setBody("");
      setRating(5);
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section style={{ marginTop: "40px" }}>
      <h2
        className="font-serif"
        style={{
          fontSize: "1.3rem",
          fontWeight: 700,
          color: "var(--brand-forest)",
          marginBottom: "16px"
        }}
      >
        Reviews
        {total > 0 && (
          <span
            style={{
              fontSize: "14px",
              fontWeight: 400,
              color: "var(--brand-muted)",
              marginLeft: "10px"
            }}
          >
            ({total})
          </span>
        )}
      </h2>

      {total > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "20px",
            padding: "14px 18px",
            background: "var(--brand-ivory)",
            border: "1px solid var(--brand-cream-dark)",
            borderRadius: "10px"
          }}
        >
          <p
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "var(--brand-forest)",
              lineHeight: 1
            }}
          >
            {average.toFixed(1)}
          </p>
          <div>
            <Stars value={Math.round(average)} />
            <p style={{ fontSize: "12px", color: "var(--brand-muted)", marginTop: "4px" }}>
              {total} review{total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--brand-muted)" }}>Loading reviews...</p>
      ) : reviews.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {reviews.map((r, i) => (
            <article
              key={r.id}
              style={{
                padding: "16px 0",
                borderBottom: i < reviews.length - 1 ? "1px solid var(--brand-cream-dark)" : "none"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "6px"
                }}
              >
                <div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--brand-ink)" }}>
                    {r.user?.name ?? "Customer"}
                  </span>
                  {r.isVerified && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#166534",
                        background: "#dcfce7",
                        padding: "2px 7px",
                        borderRadius: "999px",
                        marginLeft: "8px"
                      }}
                    >
                      ✓ Verified purchase
                    </span>
                  )}
                </div>
                <span style={{ fontSize: "11px", color: "var(--brand-muted)" }}>
                  {new Date(r.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                  })}
                </span>
              </div>
              <Stars value={r.rating} />
              {r.title && (
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--brand-ink)",
                    marginTop: "6px"
                  }}
                >
                  {r.title}
                </p>
              )}
              {r.body && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--brand-muted)",
                    marginTop: "4px",
                    lineHeight: 1.65
                  }}
                >
                  {r.body}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: "13px", color: "var(--brand-muted)", padding: "16px 0" }}>
          No reviews yet. Be the first to share your experience!
        </p>
      )}

      <div
        style={{
          marginTop: "24px",
          padding: "20px",
          background: "var(--brand-ivory)",
          border: "1px solid var(--brand-cream-dark)",
          borderRadius: "12px"
        }}
      >
        <h3
          style={{
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--brand-ink)",
            marginBottom: "14px"
          }}
        >
          Write a Review
        </h3>

        {submitted ? (
          <div
            style={{
              background: "#dcfce7",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              padding: "12px 16px"
            }}
          >
            <p style={{ fontSize: "13px", color: "#166534", fontWeight: 600 }}>
              Thank you for your review!
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div style={{ marginBottom: "12px" }}>
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--brand-muted)",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em"
                }}
              >
                Your rating *
              </p>
              <Stars value={rating} interactive onSelect={setRating} />
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Review title (optional)"
              style={{
                width: "100%",
                height: "38px",
                padding: "0 12px",
                borderRadius: "8px",
                border: "1px solid var(--brand-cream-dark)",
                fontSize: "13px",
                marginBottom: "10px",
                boxSizing: "border-box",
                outline: "none"
              }}
            />

            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your experience with this product..."
              rows={4}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--brand-cream-dark)",
                fontSize: "13px",
                resize: "vertical",
                boxSizing: "border-box",
                outline: "none",
                marginBottom: "10px"
              }}
            />

            {formErr && (
              <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "10px" }}>{formErr}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                height: "40px",
                padding: "0 24px",
                borderRadius: "8px",
                background: "var(--brand-forest)",
                color: "var(--brand-ivory)",
                fontSize: "13px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                opacity: submitting ? 0.6 : 1
              }}
            >
              {submitting ? "Submitting..." : "Submit Review"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
