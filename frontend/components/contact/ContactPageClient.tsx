"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { fetchMe } from "@/lib/auth-client";
import { EnquiryFilePicker } from "@/components/enquiries/EnquiryFilePicker";
import { submitEnquiry } from "@/lib/enquiry-api";
import {
  customerPhoneDisplay,
  customerPhoneTelHref,
  enquiryEmail,
  whatsAppSiteUrl
} from "@/lib/enquiry";
import {
  DEFAULT_ENQUIRY_SUBJECT,
  ENQUIRY_SUBJECT_OPTIONS,
  type EnquirySubjectValue
} from "@/lib/enquiry-subjects";

const inputCls =
  "min-h-[38px] w-full rounded-lg border border-brand-cream-dark bg-brand-ivory py-1.5 pl-10 pr-3 text-sm text-brand-ink transition-shadow duration-200 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30";

const SLIDES = [
  {
    src: "/images/contact/singing-bowls.jpg",
    alt: "Tibetan singing bowls in warm gold light"
  },
  {
    src: "/images/contact/sound-space.jpg",
    alt: "Sound healing room with gong and plants"
  }
] as const;

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 19.2c1.4-3 3.9-4.5 7-4.5s5.6 1.5 7 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M6.5 3.8h2.2l1.2 3-1.6 1.2a12.5 12.5 0 0 0 6.5 6.5l1.2-1.6 3 1.2v2.2c0 .8-.7 1.5-1.5 1.5C9.8 18.8 5.2 14.2 5 7.3c0-.8.7-1.5 1.5-1.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconMail() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <rect x="3.5" y="6" width="17" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4.5 7.5 7.5 6 7.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconOrder() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M7 7h10l1.5 4.5H5.5L7 7Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5.5 11.5h13V19H5.5v-7.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 15.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function IconMessage() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H5A1.5 1.5 0 0 1 3.5 15V8A1.5 1.5 0 0 1 5 6.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconClip() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="m8.5 12.5 6-6a3.2 3.2 0 0 1 4.5 4.5l-7.2 7.2a4.2 4.2 0 0 1-6-6l7.4-7.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FieldShell({
  icon,
  children,
  iconTop
}: {
  icon: ReactNode;
  children: ReactNode;
  iconTop?: boolean;
}) {
  return (
    <div className="relative">
      <span
        className={`pointer-events-none absolute left-3 text-brand-gold ${
          iconTop ? "top-2.5" : "top-1/2 -translate-y-1/2"
        }`}
      >
        {icon}
      </span>
      {children}
    </div>
  );
}

function resolveSubject(
  presetSubjectRaw: string,
  complaint: string,
  presetOrder: string
): EnquirySubjectValue {
  if (
    presetSubjectRaw === "PAYMENT" ||
    presetSubjectRaw === "ORDER" ||
    presetSubjectRaw === "COURSE" ||
    presetSubjectRaw === "CORPORATE" ||
    presetSubjectRaw === "OTHER"
  ) {
    return presetSubjectRaw;
  }
  if (complaint) return "PAYMENT";
  if (presetOrder) return "ORDER";
  return DEFAULT_ENQUIRY_SUBJECT;
}

function ContactVisual() {
  const [slide, setSlide] = useState(0);
  const email = enquiryEmail();

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((i) => (i + 1) % SLIDES.length);
    }, 7000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative h-[min(28vh,200px)] overflow-hidden lg:h-full lg:min-h-0">
      {SLIDES.map((item, i) => (
        <img
          key={item.src}
          src={item.src}
          alt={item.alt}
          className={`sv-contact-kenburns absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            i === slide ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-night/80 via-brand-night/35 to-brand-night/55" />
      <div className="sv-contact-float pointer-events-none absolute right-6 top-8 h-16 w-16 rounded-full bg-brand-gold/35 blur-md" />
      <div className="pointer-events-none absolute left-8 top-16 h-10 w-10 rounded-full bg-brand-sage/40 blur-sm" />

      <div className="absolute inset-x-0 top-0 space-y-2.5 p-4 text-white md:p-6 lg:space-y-3 lg:p-7">
        <p
          className="font-serif text-[2rem] font-semibold leading-none tracking-wide text-[#fff6df] md:text-5xl lg:text-[3.25rem]"
          style={{ textShadow: "0 2px 18px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.9)" }}
        >
          Write to us
        </p>
        <p
          className="max-w-md text-sm font-medium leading-snug text-brand-gold-pale md:text-base"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.7)" }}
        >
          Orders, payments, courses, or wellness programmes — we usually reply within 1–2 business days.
        </p>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white md:text-sm">
          Calls: Monday to Friday, 9 am to 5 pm
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a
            href={`mailto:${email}`}
            className="inline-flex min-h-[34px] items-center rounded-full border border-white/30 bg-black/35 px-3.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-brand-gold hover:text-brand-night md:min-h-[38px] md:text-sm"
          >
            {email}
          </a>
          <a
            href={whatsAppSiteUrl("Hi Sarveda, I have a question.")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[34px] items-center rounded-full border border-white/30 bg-black/35 px-3.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-[#25D366] hover:text-white md:min-h-[38px] md:text-sm"
          >
            WhatsApp {customerPhoneDisplay()}
          </a>
          <a
            href={customerPhoneTelHref()}
            className="inline-flex min-h-[34px] items-center rounded-full border border-white/30 bg-black/35 px-3.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-brand-forest md:min-h-[38px] md:text-sm"
          >
            Call · Mon–Fri 9am–5pm
          </a>
        </div>
      </div>
      <div className="absolute bottom-3 left-4 flex gap-2 md:bottom-4 md:left-6">
        {SLIDES.map((item, i) => (
          <button
            key={item.src}
            type="button"
            aria-label={`Show photo ${i + 1}`}
            onClick={() => setSlide(i)}
            className={`h-2 rounded-full transition-all ${
              i === slide ? "w-8 bg-brand-gold" : "w-2 bg-white/50 hover:bg-white"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function ContactFormInner() {
  const search = useSearchParams();
  const presetOrder = search.get("orderNumber")?.trim() ?? "";
  const presetEmail = search.get("email")?.trim() ?? "";
  const presetSubjectRaw = search.get("subject")?.trim().toUpperCase() ?? "";
  const complaint = search.get("complaint")?.trim().toLowerCase() ?? "";
  const presetSubject = resolveSubject(presetSubjectRaw, complaint, presetOrder);

  const messagePlaceholder =
    complaint === "debited"
      ? "Optional — tell us if money left your account, and when."
      : complaint === "failed"
        ? "Optional — tell us what you saw when payment failed."
        : complaint === "exit"
          ? "Optional — add a note if you need help."
          : "Tell us how we can help…";

  const defaultComplaintMessage = (): string => {
    const orderBit = presetOrder ? ` for order ${presetOrder}` : "";
    if (complaint === "debited") {
      return `I want to raise a payment complaint${orderBit}. Money may have been deducted, but the order is not showing as paid.`;
    }
    if (complaint === "failed") {
      return `I want to raise a payment complaint${orderBit}. Payment failed.`;
    }
    if (complaint === "exit") {
      return `I want to raise a payment complaint${orderBit}.`;
    }
    return "";
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState(presetEmail);
  const [phone, setPhone] = useState("");
  const [subjectCategory, setSubjectCategory] = useState<EnquirySubjectValue>(presetSubject);
  const [orderNumber, setOrderNumber] = useState(presetOrder);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);

  useEffect(() => {
    setOrderNumber(presetOrder);
    setSubjectCategory(presetSubject);
    if (presetEmail) setEmail((c) => c || presetEmail);
  }, [presetOrder, presetSubject, presetEmail]);

  useEffect(() => {
    void fetchMe().then((user) => {
      if (!user) return;
      setName((c) => c || user.name?.trim() || "");
      setEmail((c) => c || user.email);
      setPhone((c) => c || user.phone?.replace(/^\+\d+/, "") || "");
    });
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await submitEnquiry({
        source: "CONTACT",
        subjectCategory,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        message: message.trim() || defaultComplaintMessage() || "I need help with my order.",
        orderNumber: orderNumber.trim() || undefined,
        attachments: files
      });
      setConfirmText(result.message);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-white p-6 text-center">
        <p className="font-serif text-2xl font-semibold text-brand-forest">Message sent</p>
        <p className="mt-3 text-sm text-brand-ink">{confirmText}</p>
        <p className="mt-2 text-xs text-brand-muted">We will reply to {email}.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/shop"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night"
          >
            Continue shopping
          </Link>
          {presetOrder ? (
            <Link
              href="/profile?tab=orders"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-cream-dark bg-white px-6 text-sm font-medium text-brand-ink transition-colors hover:bg-brand-cream"
            >
              Your orders
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="flex h-full min-h-0 flex-col overflow-hidden bg-white px-4 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-4"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Contact</p>
      <h1 className="font-serif text-xl font-semibold leading-tight text-brand-ink md:text-2xl">Send a message</h1>

      {presetOrder ? (
        <p className="mt-2 rounded-lg border border-brand-gold-pale/60 bg-brand-cream px-3 py-2 text-xs text-brand-ink">
          {complaint ? "Payment complaint for order " : "Order reference: "}
          <span className="font-mono font-medium">{presetOrder}</span>
        </p>
      ) : null}

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 content-start gap-2.5 overflow-y-auto sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="contact-subject" className="mb-1 block text-xs font-medium text-brand-ink">
            What is this about? <span className="text-brand-terra">*</span>
          </label>
          <div className="relative">
            <select
              id="contact-subject"
              value={subjectCategory}
              onChange={(e) => setSubjectCategory(e.target.value as EnquirySubjectValue)}
              required
              className={`${inputCls} appearance-none pl-3 pr-10`}
            >
              {ENQUIRY_SUBJECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-gold">
              <IconChevron />
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="contact-name" className="mb-1 block text-xs font-medium text-brand-ink">
            Name <span className="text-brand-terra">*</span>
          </label>
          <FieldShell icon={<IconUser />}>
            <input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Your name"
              className={inputCls}
            />
          </FieldShell>
        </div>
        <div>
          <label htmlFor="contact-phone" className="mb-1 block text-xs font-medium text-brand-ink">
            Phone <span className="text-brand-terra">*</span>
          </label>
          <FieldShell icon={<IconPhone />}>
            <input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              autoComplete="tel"
              placeholder="Phone number"
              className={inputCls}
            />
          </FieldShell>
        </div>

        <div>
          <label htmlFor="contact-email" className="mb-1 block text-xs font-medium text-brand-ink">
            Email <span className="text-brand-terra">*</span>
          </label>
          <FieldShell icon={<IconMail />}>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="Email"
              className={inputCls}
            />
          </FieldShell>
        </div>

        <div>
          <label htmlFor="contact-order" className="mb-1 block text-xs font-medium text-brand-ink">
            Order number <span className="font-normal text-brand-muted">(optional)</span>
          </label>
          <FieldShell icon={<IconOrder />}>
            <input
              id="contact-order"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="SRV-20260600001"
              className={`${inputCls} font-mono`}
            />
          </FieldShell>
        </div>

        <div className="flex min-h-0 flex-col sm:col-span-2">
          <label htmlFor="contact-message" className="mb-1 block text-xs font-medium text-brand-ink">
            Message {complaint ? <span className="font-normal text-brand-muted">(optional)</span> : <span className="text-brand-terra">*</span>}
          </label>
          <FieldShell icon={<IconMessage />} iconTop>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required={!complaint}
              rows={3}
              placeholder={messagePlaceholder}
              className="min-h-[72px] w-full resize-none rounded-lg border border-brand-cream-dark bg-brand-ivory py-2 pl-10 pr-3 text-sm text-brand-ink transition-shadow duration-200 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            />
          </FieldShell>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 flex items-center gap-2 text-xs font-medium text-brand-ink">
            <span className="text-brand-gold">
              <IconClip />
            </span>
            Attachments <span className="font-normal text-brand-muted">(optional)</span>
          </label>
          <EnquiryFilePicker compact files={files} onChange={setFiles} onError={setError} disabled={loading} />
        </div>

        {error ? (
          <p className="text-sm text-red-600 sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="sv-contact-cta mt-3 inline-flex min-h-[42px] w-full shrink-0 items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-gold transition-opacity hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "Uploading & sending…" : "Send message"}
      </button>
    </form>
  );
}

export function ContactPageClient() {
  return (
    <div className="relative h-[calc(100dvh-var(--storefront-header-live-offset)-4.5rem-env(safe-area-inset-bottom,0px))] overflow-hidden bg-brand-cream p-2 md:h-[calc(100dvh-var(--storefront-header-live-offset)-var(--storefront-slim-footer-offset))] md:p-2.5">
      <span className="sv-contact-blob pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-brand-gold/20 blur-3xl" aria-hidden />
      <span className="sv-contact-blob-delay pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-brand-sage/20 blur-3xl" aria-hidden />

      <div className="relative z-[1] grid h-full min-h-0 grid-rows-[min(28vh,200px)_minmax(0,1fr)] overflow-hidden rounded-2xl border border-brand-cream-dark bg-white shadow-card lg:grid-cols-2 lg:grid-rows-none">
        <ContactVisual />
        <Suspense fallback={<p className="p-8 text-sm text-brand-muted">Loading form…</p>}>
          <ContactFormInner />
        </Suspense>
      </div>
    </div>
  );
}
