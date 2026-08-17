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
  "min-h-[46px] w-full rounded-xl border border-brand-cream-dark bg-brand-ivory py-2 pl-11 pr-3 text-sm text-brand-ink transition-shadow duration-200 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30";

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

function IconTopic() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

function FieldShell({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-3.5 text-brand-gold">{icon}</span>
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
    <div className="relative min-h-[320px] overflow-hidden lg:min-h-full">
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
      <div className="absolute inset-0 bg-gradient-to-t from-brand-night/85 via-brand-forest/25 to-transparent" />
      <div className="sv-contact-float pointer-events-none absolute right-6 top-8 h-16 w-16 rounded-full bg-brand-gold/35 blur-md" />
      <div className="pointer-events-none absolute left-8 top-16 h-10 w-10 rounded-full bg-brand-sage/40 blur-sm" />

      <div className="absolute inset-x-0 bottom-0 space-y-4 p-6 text-white md:p-8">
        <p className="font-serif text-3xl font-semibold leading-tight md:text-4xl">Write to us</p>
        <p className="max-w-sm text-sm leading-relaxed text-brand-gold-pale">
          Orders, payments, courses, or wellness programmes — we usually reply within 1–2 business days.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`mailto:${email}`}
            className="inline-flex min-h-[40px] items-center rounded-full border border-white/25 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-brand-gold hover:text-brand-night"
          >
            {email}
          </a>
          <a
            href={whatsAppSiteUrl("Hi Sarveda, I have a question.")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[40px] items-center rounded-full border border-white/25 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-[#25D366] hover:text-white"
          >
            WhatsApp {customerPhoneDisplay()}
          </a>
          <a
            href={customerPhoneTelHref()}
            className="inline-flex min-h-[40px] items-center rounded-full border border-white/25 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white hover:text-brand-forest"
          >
            Call
          </a>
        </div>
        <div className="flex gap-2 pt-1">
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
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center bg-white p-8 text-center">
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
    <form onSubmit={(event) => void onSubmit(event)} className="flex h-full flex-col bg-white p-5 sm:p-7 lg:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Contact</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-brand-ink md:text-3xl">Send a message</h1>
      <p className="mt-2 text-sm text-brand-muted">Only order number and attachments are optional.</p>

      {presetOrder ? (
        <p className="mt-4 rounded-xl border border-brand-gold-pale/60 bg-brand-cream px-4 py-3 text-sm text-brand-ink">
          {complaint ? "Payment complaint for order " : "Order reference: "}
          <span className="font-mono font-medium">{presetOrder}</span>
        </p>
      ) : null}

      <div className="mt-5 flex-1 space-y-4">
        <div>
          <label htmlFor="contact-subject" className="mb-2 block text-sm font-medium text-brand-ink">
            What is this about? <span className="text-brand-terra">*</span>
          </label>
          <FieldShell icon={<IconTopic />}>
            <select
              id="contact-subject"
              value={subjectCategory}
              onChange={(e) => setSubjectCategory(e.target.value as EnquirySubjectValue)}
              required
              className={`${inputCls} appearance-none`}
            >
              {ENQUIRY_SUBJECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FieldShell>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-name" className="mb-2 block text-sm font-medium text-brand-ink">
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
            <label htmlFor="contact-phone" className="mb-2 block text-sm font-medium text-brand-ink">
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
        </div>

        <div>
          <label htmlFor="contact-email" className="mb-2 block text-sm font-medium text-brand-ink">
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
          <label htmlFor="contact-order" className="mb-2 block text-sm font-medium text-brand-ink">
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

        <div>
          <label htmlFor="contact-message" className="mb-2 block text-sm font-medium text-brand-ink">
            Message {complaint ? <span className="font-normal text-brand-muted">(optional)</span> : <span className="text-brand-terra">*</span>}
          </label>
          <FieldShell icon={<IconMessage />}>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required={!complaint}
              rows={5}
              placeholder={messagePlaceholder}
              className="w-full resize-y rounded-xl border border-brand-cream-dark bg-brand-ivory py-3 pl-11 pr-4 text-sm text-brand-ink transition-shadow duration-200 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
            />
          </FieldShell>
        </div>

        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-brand-ink">
            <span className="text-brand-gold">
              <IconClip />
            </span>
            Attachments <span className="font-normal text-brand-muted">(optional)</span>
          </label>
          <p className="mb-2 text-xs text-brand-muted">
            Photos, PDF, Word, audio, or video. After you pick files, they appear in the list below.
          </p>
          <EnquiryFilePicker files={files} onChange={setFiles} onError={setError} disabled={loading} />
        </div>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="sv-contact-cta mt-2 inline-flex min-h-[50px] w-full items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-gold transition-opacity hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Uploading & sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}

export function ContactPageClient() {
  return (
    <main className="relative overflow-hidden bg-brand-cream p-4 md:p-5 lg:p-6">
      <span className="sv-contact-blob pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-brand-gold/20 blur-3xl" aria-hidden />
      <span className="sv-contact-blob-delay pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-brand-sage/20 blur-3xl" aria-hidden />

      <div
        className="relative z-[1] grid min-h-[calc(100dvh-var(--storefront-header-live-offset)-var(--storefront-slim-footer-offset)-2rem)] overflow-hidden rounded-3xl border border-brand-cream-dark bg-white shadow-card lg:grid-cols-2"
      >
        <ContactVisual />
        <Suspense fallback={<p className="p-8 text-sm text-brand-muted">Loading form…</p>}>
          <ContactFormInner />
        </Suspense>
      </div>
    </main>
  );
}
