"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cartAdd } from "@/lib/cart-api";
import { buildEnquiryMailto, buildEnquiryWhatsAppUrl } from "@/lib/enquiry";
import { formatINRFromPaise } from "@/lib/money";
import type { EnrollableItem } from "@/lib/enrollable";
import { absoluteUrl } from "@/lib/site";

type Props = {
  item: EnrollableItem;
  /** URL path segment: course or event */
  pathPrefix: "course" | "event";
  payLabel?: string;
};

export function CourseEnrollActions({
  item: course,
  pathPrefix,
  payLabel = "Pay & enrol online"
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courseUrl = absoluteUrl(`/${pathPrefix}/${course.slug}`);
  const showPay =
    (course.enrollmentMode === "CHECKOUT" || course.enrollmentMode === "BOTH") &&
    course.checkoutVariantId &&
    course.priceInPaise > 0;
  const showEnquire =
    course.enrollmentMode === "ENQUIRY" || course.enrollmentMode === "BOTH" || !showPay;

  const pay = async () => {
    if (!course.checkoutVariantId) return;
    setLoading(true);
    setError(null);
    try {
      await cartAdd(course.checkoutVariantId, 1);
      router.push("/checkout");
    } catch {
      setError("Could not start checkout. Please try again or contact us.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-brand-bg p-5 md:p-6">
      {course.priceInPaise > 0 ? (
        <p className="price-text font-serif text-2xl font-semibold text-brand-ink">
          {formatINRFromPaise(course.priceInPaise)}
          <span className="ml-2 text-sm font-normal text-brand-muted">GST inclusive</span>
        </p>
      ) : (
        <p className="font-serif text-xl font-semibold text-brand-ink">Enquire for pricing</p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {showPay ? (
          <button
            type="button"
            onClick={() => void pay()}
            disabled={loading}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-brand-violet px-6 text-sm font-semibold text-white shadow-violet-sm transition hover:-translate-y-px hover:bg-brand-violet-mid disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading ? "Please wait…" : payLabel}
          </button>
        ) : null}

        {showEnquire ? (
          <>
            <a
              href={buildEnquiryWhatsAppUrl(course.title, courseUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full border border-brand-sage bg-brand-sage-light px-6 text-sm font-semibold text-brand-sage transition hover:bg-brand-sage-light/80"
            >
              WhatsApp enquiry
            </a>
            <a
              href={buildEnquiryMailto(course.title, courseUrl)}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border border-[rgba(196,176,232,0.35)] bg-white px-6 text-sm font-semibold text-brand-ink transition hover:border-brand-lavender-mid hover:bg-brand-violet-light"
            >
              Email enquiry
            </a>
          </>
        ) : null}
      </div>

      {course.enrollmentMode === "BOTH" && showPay ? (
        <p className="mt-3 text-xs text-brand-muted">
          Prefer to speak with us first? Use WhatsApp or email — we are happy to help before you pay.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <p className="mt-4 text-xs text-brand-muted">
        Questions?{" "}
        <Link href="/shop" className="font-medium text-brand-violet underline hover:text-brand-violet-mid">
          Browse products
        </Link>
      </p>
    </div>
  );
}
