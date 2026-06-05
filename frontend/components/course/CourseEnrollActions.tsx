"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cartAdd } from "@/lib/cart-api";
import { submitCourseEnquiry } from "@/lib/course-enquiry";
import { buildEnquiryWhatsAppUrl } from "@/lib/enquiry";
import { formatINRFromPaise } from "@/lib/money";
import type { EnrollableItem } from "@/lib/enrollable";
import { absoluteUrl } from "@/lib/site";

type Props = {
  item: EnrollableItem;
  /** URL path segment: course or event */
  pathPrefix: "course" | "event";
  payLabel?: string;
  /** When true, checkout / enrol is hidden (e.g. past course intake). */
  registrationClosed?: boolean;
  /** Sidebar embed — skip card wrapper and duplicate price block. */
  embedded?: boolean;
};

export function CourseEnrollActions({
  item: course,
  pathPrefix,
  payLabel = "Pay & enrol online",
  registrationClosed = false,
  embedded = false
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const courseUrl = absoluteUrl(`/${pathPrefix}/${course.slug}`);
  const showPay =
    !registrationClosed &&
    (course.enrollmentMode === "CHECKOUT" || course.enrollmentMode === "BOTH") &&
    course.checkoutVariantId &&
    course.priceInPaise > 0;
  const showEnquire =
    !registrationClosed &&
    (course.enrollmentMode === "ENQUIRY" || course.enrollmentMode === "BOTH" || !showPay);

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

  const sendEmailEnquiry = async () => {
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setEmailSending(true);
    setError(null);
    try {
      await submitCourseEnquiry({
        email: email.trim(),
        courseTitle: course.title,
        courseUrl
      });
      setEmailSent(true);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Could not send enquiry. Please try WhatsApp.");
    } finally {
      setEmailSending(false);
    }
  };

  const wrapperClass = embedded ? "space-y-0" : "rounded-2xl border border-stone-200 bg-stone-50 p-5 md:p-6";

  return (
    <div className={wrapperClass}>
      {registrationClosed ? (
        <>
          <p
            className={
              embedded
                ? "text-base font-semibold text-stone-900"
                : "font-serif text-lg font-semibold text-stone-900"
            }
          >
            Registration closed
          </p>
          <p className="mt-2 text-sm text-stone-600">
            This {pathPrefix === "course" ? "programme" : "event"} has ended. Online enrolment and
            payment are no longer available for this intake.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <a
              href={buildEnquiryWhatsAppUrl(course.title, courseUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-emerald-600 bg-emerald-50 px-5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
            >
              Ask about a future intake
            </a>
            <Link
              href={pathPrefix === "course" ? "/courses" : "/events"}
              className="text-center text-sm font-medium text-amber-800 underline hover:text-amber-900"
            >
              View {pathPrefix === "course" ? "all courses" : "all events"}
            </Link>
          </div>
        </>
      ) : (
        <>
          {!embedded && course.priceInPaise > 0 ? (
            <p className="font-sans text-2xl font-semibold tabular-nums tracking-tight text-stone-900">
              {formatINRFromPaise(course.priceInPaise)}
              <span className="ml-2 text-sm font-normal text-stone-500">GST inclusive</span>
            </p>
          ) : !embedded ? (
            <p className="font-sans text-xl font-semibold text-stone-900">Enquire for pricing</p>
          ) : null}

          <div className={`flex flex-col gap-3 ${embedded ? "" : "mt-5 sm:flex-row sm:flex-wrap"}`}>
            {showPay ? (
              <button
                type="button"
                onClick={() => void pay()}
                disabled={loading}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-amber-50 transition hover:bg-stone-800 disabled:opacity-60"
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
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full border border-emerald-600 bg-emerald-50 px-6 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  WhatsApp enquiry
                </a>
              </>
            ) : null}
          </div>

          {showEnquire && pathPrefix === "course" ? (
            <div className={`space-y-3 ${embedded ? "mt-4 border-t border-stone-200 pt-4" : "mt-4"}`}>
              <p className="text-xs text-stone-500">
                Or email us — we&apos;ll send your enquiry to care@sarveda.com
              </p>
              {emailSent ? (
                <p className="text-sm text-emerald-700">Enquiry sent. We will reply to {email}.</p>
              ) : (
                <>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Your email address"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900"
                  />
                  <button
                    type="button"
                    onClick={() => void sendEmailEnquiry()}
                    disabled={emailSending}
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-800 transition hover:border-amber-400 hover:bg-amber-50 disabled:opacity-60"
                  >
                    {emailSending ? "Sending…" : "Email enquiry"}
                  </button>
                </>
              )}
            </div>
          ) : showEnquire && pathPrefix === "event" ? (
            <a
              href={`mailto:care@sarveda.com?subject=${encodeURIComponent(`Event enquiry: ${course.title}`)}`}
              className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-800 transition hover:border-amber-400 hover:bg-amber-50"
            >
              Email enquiry
            </a>
          ) : null}

          {course.enrollmentMode === "BOTH" && showPay ? (
            <p className="mt-3 text-xs text-stone-500">
              Prefer to speak with us first? Use WhatsApp or email — we are happy to help before you pay.
            </p>
          ) : null}

          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

          {showPay ? (
            <p className="mt-3 text-xs text-stone-500">
              Sign in before checkout to see your course or event under Profile → Courses & events.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
