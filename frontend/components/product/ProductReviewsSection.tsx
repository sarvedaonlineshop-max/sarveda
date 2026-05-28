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
    <div className="flex items-center gap-1 text-amber-500">
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
      <h2 className="font-serif text-xl font-semibold text-stone-900">Reviews</h2>
      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-5">
        {reviews.length > 0 ? (
          <>
            <div className="mb-5 flex items-center gap-3">
              <Stars value={Math.round(average)} />
              <p className="text-sm text-stone-600">
                {average.toFixed(1)} out of 5 ({reviews.length} review{reviews.length > 1 ? "s" : ""})
              </p>
            </div>
            <div className="space-y-4">
              {reviews.map((review) => (
                <article key={review.id} className="border-b border-stone-100 pb-4 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-stone-800">{review.user?.name || "Verified customer"}</p>
                    <p className="text-xs text-stone-500">{new Date(review.createdAt).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="mt-1">
                    <Stars value={review.rating} />
                  </div>
                  {review.title ? <p className="mt-2 text-sm font-medium text-stone-800">{review.title}</p> : null}
                  {review.body ? <p className="mt-1 text-sm text-stone-600">{review.body}</p> : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-600">Be the first to review this product.</p>
        )}

        <form
          className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            alert("Review submission API is not connected yet.");
          }}
        >
          <p className="text-sm font-semibold text-stone-800">Add a review</p>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => {
              const val = i + 1;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRating(val)}
                  className={`text-lg ${val <= rating ? "text-amber-500" : "text-stone-300"}`}
                >
                  ★
                </button>
              );
            })}
          </div>
          <textarea
            className="mt-3 w-full rounded-md border border-stone-300 bg-white p-2 text-sm"
            rows={4}
            placeholder="Write your review"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            type="submit"
            className="mt-3 rounded-md bg-[#1e3a2f] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          >
            Submit Review
          </button>
        </form>
      </div>
    </section>
  );
}
