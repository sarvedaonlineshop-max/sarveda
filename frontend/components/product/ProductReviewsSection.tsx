"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";
import { decodeHtmlEntities } from "@/lib/sanitize-html";
import { fetchMe, type PublicUser } from "@/lib/auth-client";
import { CountryFlag } from "@/components/product/CountryFlag";
import { zoneToReviewerCountry } from "@/lib/currency";
import { usePricingZone } from "@/hooks/usePricingZone";

type Review = {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  createdAt: string;
  isVerified?: boolean;
  reviewerCountry?: string | null;
  user?: { name?: string | null } | null;
};

type Props = { productId: string };

function reviewerInitials(name: string | null | undefined): string {
  const parts = (name ?? "Customer").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

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
              color: filled ? "var(--brand-gold)" : "var(--brand-cream-dark)",
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
  const pathname = usePathname();
  const loginHref = `/login?next=${encodeURIComponent(pathname || "/")}`;
  const zone = usePricingZone();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [average, setAverage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [sessionUser, setSessionUser] = useState<PublicUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

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

  useEffect(() => {
    void fetchMe().then((user) => {
      setSessionUser(user);
      setSessionChecked(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormErr(null);
    try {
      const res = await fetch(`${getApiBase()}/api/reviews/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rating,
          title,
          body,
          reviewerCountry: zoneToReviewerCountry(zone)
        })
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (res.status === 401) {
        throw new Error("SIGN_IN_REQUIRED");
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to submit review");
      setSubmitted(true);
      setTitle("");
      setBody("");
      setRating(5);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setFormErr(
        msg === "SIGN_IN_REQUIRED"
          ? "Please sign in to submit your review."
          : msg === "Not authenticated"
            ? "Please sign in to submit your review."
            : msg
      );
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
          {reviews.map((r, i) => {
            const displayName = r.user?.name?.trim() || "Customer";
            const initials = reviewerInitials(displayName);
            return (
            <article
              key={r.id}
              style={{
                padding: "18px 0",
                borderBottom: i < reviews.length - 1 ? "1px solid var(--brand-cream-dark)" : "none"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "12px",
                  marginBottom: "8px"
                }}
              >
                <div style={{ display: "flex", gap: "12px", minWidth: 0 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "999px",
                        background: "var(--brand-forest)",
                        color: "var(--brand-cream)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "13px",
                        fontWeight: 700
                      }}
                      aria-hidden
                    >
                      {initials}
                    </div>
                    {r.isVerified ? (
                      <span
                        style={{
                          position: "absolute",
                          right: -2,
                          bottom: -2,
                          width: 16,
                          height: 16,
                          borderRadius: "999px",
                          background: "#16a34a",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          border: "2px solid #fff"
                        }}
                        title="Verified buyer"
                        aria-label="Verified buyer"
                      >
                        ✓
                      </span>
                    ) : null}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--brand-ink)" }}>
                        {displayName}
                      </span>
                      {r.isVerified ? (
                        <span className="inline-flex items-center rounded-full border border-[#108967]/35 bg-[#e8f6f1] px-2.5 py-[3px] text-[11px] font-semibold leading-none text-[#108967]">
                          Verified Buyer
                        </span>
                      ) : null}
                    </div>
                    {r.reviewerCountry ? (
                      <div style={{ marginTop: "4px" }}>
                        <CountryFlag code={r.reviewerCountry} />
                      </div>
                    ) : null}
                  </div>
                </div>
                <span style={{ fontSize: "12px", color: "var(--brand-muted)", whiteSpace: "nowrap" }}>
                  {new Date(r.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                  })}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                <Stars value={r.rating} />
                {r.title ? (
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "var(--brand-ink)",
                      margin: 0
                    }}
                  >
                    {decodeHtmlEntities(r.title)}
                  </p>
                ) : null}
              </div>
              {r.body && (
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--brand-ink)",
                    marginTop: "8px",
                    lineHeight: 1.65
                  }}
                >
                  {decodeHtmlEntities(r.body)}
                </p>
              )}
            </article>
            );
          })}
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
          Write a review
        </h3>

        {!sessionChecked ? (
          <p style={{ fontSize: "13px", color: "var(--brand-muted)" }}>Loading…</p>
        ) : !sessionUser ? (
          <div>
            <p style={{ fontSize: "14px", color: "var(--brand-muted)", lineHeight: 1.6, marginBottom: "14px" }}>
              Sign in to share your experience with this product.
            </p>
            <Link
              href={loginHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "40px",
                padding: "0 20px",
                borderRadius: "8px",
                background: "var(--brand-forest)",
                color: "var(--brand-ivory)",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              Sign in to write a review
            </Link>
          </div>
        ) : submitted ? (
          <div
            style={{
              background: "rgba(28,53,42,0.07)",
              border: "1px solid rgba(28,53,42,0.15)",
              borderRadius: "8px",
              padding: "12px 16px"
            }}
          >
            <p style={{ fontSize: "13px", color: "var(--brand-forest)", fontWeight: 600 }}>
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
              <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "10px" }}>
                {formErr}{" "}
                {formErr.includes("sign in") ? (
                  <Link href={loginHref} style={{ color: "var(--brand-forest)", fontWeight: 600 }}>
                    Sign in
                  </Link>
                ) : null}
              </p>
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
              {submitting ? "Submitting…" : "Submit review"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
