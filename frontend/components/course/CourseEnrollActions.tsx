"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { cartAddDigital } from "@/lib/cart-api";
import { submitCourseEnquiry } from "@/lib/course-enquiry";
import { buildCourseEnquiryMessage, buildEnquiryWhatsAppUrl } from "@/lib/enquiry";
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

const primaryButton =
  "inline-flex min-h-[50px] flex-1 items-center justify-center rounded-full bg-[#166D46] px-6 text-sm font-bold text-white shadow-[0_16px_38px_rgba(22,109,70,0.22)] transition hover:-translate-y-0.5 hover:bg-[#145a3a] hover:shadow-[0_20px_48px_rgba(22,109,70,0.28)] disabled:translate-y-0 disabled:opacity-60";
const outlineButton =
  "inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-full border border-[#b98a3e] bg-[#fffaf2] px-6 text-sm font-bold text-[#8b6428] transition hover:-translate-y-0.5 hover:bg-white disabled:translate-y-0 disabled:opacity-60";
const softInput =
  "w-full rounded-2xl border border-[#eadfcf] bg-white px-4 py-3 text-sm text-[#10201a] shadow-inner outline-none transition placeholder:text-[#8ca094] focus:border-[#166D46] focus:ring-4 focus:ring-[#166D46]/10";

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
  const [enquiryMessage, setEnquiryMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const courseUrl = absoluteUrl(`/${pathPrefix}/${course.slug}`);

  useEffect(() => {
    setEnquiryMessage(buildCourseEnquiryMessage(course.title));
  }, [course.title]);

  const showPay =
    !registrationClosed &&
    (course.enrollmentMode === "CHECKOUT" || course.enrollmentMode === "BOTH") &&
    course.priceInPaise > 0;
  const showEnquire =
    !registrationClosed &&
    (course.enrollmentMode === "ENQUIRY" || course.enrollmentMode === "BOTH" || !showPay);

  const pay = async () => {
    setLoading(true);
    setError(null);
    try {
      const prepRes = await fetch(`/api/${pathPrefix}s/${encodeURIComponent(course.slug)}/prepare-checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
      });
      const prepJson = (await prepRes.json()) as {
        success?: boolean;
        data?: { digitalOfferId?: string; variantId?: string };
        error?: string;
      };
      const digitalOfferId = prepJson.data?.digitalOfferId;
      if (!prepRes.ok || !digitalOfferId) {
        throw new Error(prepJson.error || "prepare-checkout failed");
      }
      await cartAddDigital(digitalOfferId, 1);
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
        courseUrl,
        message: enquiryMessage.trim() || buildCourseEnquiryMessage(course.title)
      });
      setEmailSent(true);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Could not send enquiry. Please try WhatsApp.");
    } finally {
      setEmailSending(false);
    }
  };

  const wrapperClass = embedded ? "space-y-0" : "rounded-[1.5rem] border border-[#eadfcf] bg-white/82 p-5 shadow-[0_18px_50px_rgba(28,53,42,0.07)] md:p-6";

  return (
    <div className={wrapperClass}>
      {registrationClosed ? (
        <>
          <p className={embedded ? "text-base font-bold text-[#10201a]" : "font-serif text-xl font-semibold text-[#10201a]"}>
            Registration closed
          </p>
          <p className="mt-2 text-sm leading-6 text-[#65766c]">
            This {pathPrefix === "course" ? "programme" : "event"} has ended. Online enrolment and
            payment are no longer available for this intake.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <a href={buildEnquiryWhatsAppUrl(course.title, courseUrl)} target="_blank" rel="noopener noreferrer" className={outlineButton}>
              Ask about a future intake
            </a>
            <Link href={pathPrefix === "course" ? "/courses" : "/events"} className="text-center text-sm font-bold text-[#8b6428] underline underline-offset-4 hover:text-[#166D46]">
              View {pathPrefix === "course" ? "all courses" : "all events"}
            </Link>
          </div>
        </>
      ) : (
        <>
          {!embedded && course.priceInPaise > 0 ? (
            <p className="font-sans text-3xl font-semibold tabular-nums tracking-tight text-[#10201a]">
              {formatINRFromPaise(course.priceInPaise)}
              <span className="ml-2 text-sm font-normal text-[#65766c]">GST inclusive</span>
            </p>
          ) : !embedded ? (
            <p className="font-sans text-xl font-semibold text-[#10201a]">Enquire for pricing</p>
          ) : null}

          <div className={`flex flex-col gap-3 ${embedded ? "" : "mt-5 sm:flex-row sm:flex-wrap"}`}>
            {showPay ? (
              <button type="button" onClick={() => void pay()} disabled={loading} className={primaryButton}>
                {loading ? "Preparing checkout…" : payLabel}
              </button>
            ) : null}

            {showEnquire ? (
              <a href={buildEnquiryWhatsAppUrl(course.title, courseUrl)} target="_blank" rel="noopener noreferrer" className={showPay ? outlineButton : primaryButton}>
                WhatsApp enquiry
              </a>
            ) : null}
          </div>

          {showEnquire && pathPrefix === "course" ? (
            <div className={`space-y-3 ${embedded ? "mt-5 border-t border-[#eadfcf] pt-5" : "mt-5"}`}>
              <p className="text-xs leading-5 text-[#65766c]">
                Prefer email? Share your questions and our team will reply from care@sarveda.com.
              </p>
              {emailSent ? (
                <p className="rounded-2xl border border-[#bfe8cd] bg-[#eefaf3] px-4 py-3 text-sm font-medium text-[#0e6a42]">
                  Enquiry sent. We will reply to {email}.
                </p>
              ) : (
                <>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" className={softInput} />
                  <textarea value={enquiryMessage} onChange={(e) => setEnquiryMessage(e.target.value)} rows={3} placeholder="Your questions about this course…" className={`${softInput} resize-y`} />
                  <button type="button" onClick={() => void sendEmailEnquiry()} disabled={emailSending} className={outlineButton}>
                    {emailSending ? "Sending…" : "Email enquiry"}
                  </button>
                </>
              )}
            </div>
          ) : showEnquire && pathPrefix === "event" ? (
            <EventEmailEnquiry title={course.title} slug={course.slug} courseUrl={courseUrl} />
          ) : null}

          {course.enrollmentMode === "BOTH" && showPay ? (
            <p className="mt-4 text-xs leading-5 text-[#65766c]">
              Prefer to speak with us first? Use WhatsApp or email before you pay.
            </p>
          ) : null}

          {error ? <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

          {showPay ? (
            <p className="mt-4 text-xs leading-5 text-[#65766c]">
              Sign in before checkout to see this course under Profile → Courses & events.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function EventEmailEnquiry({
  title,
  courseUrl
}: {
  title: string;
  slug: string;
  courseUrl: string;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(`Hi, I have questions about the event: ${title}`);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-5 space-y-3 border-t border-[#eadfcf] pt-5">
      {sent ? (
        <p className="rounded-2xl border border-[#bfe8cd] bg-[#eefaf3] px-4 py-3 text-sm font-medium text-[#0e6a42]">
          Enquiry sent. We will reply to {email}.
        </p>
      ) : (
        <>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className={softInput} />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={`${softInput} resize-y`} />
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            type="button"
            disabled={sending}
            onClick={() => {
              void (async () => {
                if (!email.trim()) {
                  setError("Please enter your email.");
                  return;
                }
                setSending(true);
                setError(null);
                try {
                  const { submitEnquiry } = await import("@/lib/enquiry-api");
                  await submitEnquiry({
                    source: "EVENT",
                    subjectCategory: "COURSE",
                    name: email.split("@")[0] || "Guest",
                    email: email.trim(),
                    message: message.trim(),
                    contextTitle: title,
                    contextUrl: courseUrl
                  });
                  setSent(true);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not send enquiry.");
                } finally {
                  setSending(false);
                }
              })();
            }}
            className={outlineButton}
          >
            {sending ? "Sending…" : "Email enquiry"}
          </button>
        </>
      )}
    </div>
  );
}