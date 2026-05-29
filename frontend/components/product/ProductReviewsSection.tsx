"use client";

import { useMemo, useState } from "react";

type Review = {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  createdAt: string;
  user?: { name?: string | null } | null;
};

type Props = {
  reviews?: Review[];
};

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1 text-brand-gold">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < value ? "opacity-100" : "opacity-30"}>
          ★
        </span>
      ))}
    </div>
  );
}

export function ProductReviewsSection({ reviews = [] }: Props) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const average = useMemo(
    () => (reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0),
    [reviews]
  );

  return (
    <section>
      <h2 className="display-text font-serif text-xl font-semibold text-brand-ink">Reviews</h2>
      <div className="mt-4 rounded-xl border border-[rgba(196,176,232,0.25)] bg-white p-5">
        {reviews.length > 0 ? (
          <>
            <div className="mb-5 flex items-center gap-3">
              <Stars value={Math.round(average)} />
              <p className="text-sm text-brand-mid">
                {average.toFixed(1)} out of 5 ({reviews.length} review{reviews.length > 1 ? "s" : ""})
              </p>
            </div>
            <div className="space-y-4">
              {reviews.map((review) => (
                <article key={review.id} className="border-b border-[rgba(196,176,232,0.25)] pb-4 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-brand-ink">{review.user?.name || "Verified customer"}</p>
                    <p className="text-xs text-brand-muted">{new Date(review.createdAt).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="mt-1">
                    <Stars value={review.rating} />
                  </div>
                  {review.title ? <p className="mt-2 text-sm font-medium text-brand-ink">{review.title}</p> : null}
                  {review.body ? <p className="mt-1 text-sm text-brand-mid">{review.body}</p> : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-brand-mid">Be the first to review this product.</p>
        )}

        <form
          className="mt-6 rounded-lg border border-[rgba(196,176,232,0.25)] bg-brand-bg p-4"
          onSubmit={(e) => {
            e.preventDefault();
            alert("Review submission API is not connected yet.");
          }}
        >
          <p className="text-sm font-semibold text-brand-ink">Add a review</p>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => {
              const val = i + 1;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRating(val)}
                  className={`text-lg ${val <= rating ? "text-brand-gold" : "text-brand-lavender-mid/50"}`}
                >
                  ★
                </button>
              );
            })}
          </div>
          <textarea
            className="mt-3 w-full rounded-md border border-[rgba(196,176,232,0.35)] bg-white p-2 text-sm"
            rows={4}
            placeholder="Write your review"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary mt-3 rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wide"
          >
            Submit Review
          </button>
        </form>
      </div>
    </section>
  );
}
