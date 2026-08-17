"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
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
  "min-h-[46px] w-full rounded-xl border border-brand-cream-dark bg-brand-ivory px-3 text-sm text-brand-ink transition-shadow duration-200 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30";

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
    <div className="relative min-h-[420px] overflow-hidden rounded-3xl shadow-gold-lg md:min-h-full">
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
    setLoading(true);
    setError(null);
    try {
      const result = await submitEnquiry({
        source: "CONTACT",
        subjectCategory,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
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
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-brand-sage/25 bg-white p-8 text-center shadow-card animate-fade-up">
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
      className="rounded-3xl border border-brand-cream-dark bg-white p-5 shadow-card animate-fade-up sm:p-7"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Contact</p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-brand-ink md:text-3xl">Send a message</h1>
      <p className="mt-2 text-sm text-brand-muted">Fields with a star are required. Attachments are optional.</p>

      {presetOrder ? (
        <p className="mt-4 rounded-xl border border-brand-gold-pale/60 bg-brand-cream px-4 py-3 text-sm text-brand-ink">
          {complaint ? "Payment complaint for order " : "Order reference: "}
          <span className="font-mono font-medium">{presetOrder}</span>
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        <div>
          <label htmlFor="contact-subject" className="mb-2 block text-sm font-medium text-brand-ink">
            What is this about?
          </label>
          <select
            id="contact-subject"
            value={subjectCategory}
            onChange={(e) => setSubjectCategory(e.target.value as EnquirySubjectValue)}
            className={inputCls}
          >
            {ENQUIRY_SUBJECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-name" className="mb-2 block text-sm font-medium text-brand-ink">
              Name
            </label>
            <input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              placeholder="Name"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="contact-phone" className="mb-2 block text-sm font-medium text-brand-ink">
              Phone (optional)
            </label>
            <input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="Phone number"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label htmlFor="contact-email" className="mb-2 block text-sm font-medium text-brand-ink">
            Email
          </label>
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
        </div>

        <div>
          <label htmlFor="contact-order" className="mb-2 block text-sm font-medium text-brand-ink">
            Order number {subjectCategory === "ORDER" || subjectCategory === "PAYMENT" ? "" : "(optional)"}
          </label>
          <input
            id="contact-order"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="SRV-20260600001"
            className={`${inputCls} font-mono`}
          />
        </div>

        <div>
          <label htmlFor="contact-message" className="mb-2 block text-sm font-medium text-brand-ink">
            Message {complaint ? "(optional)" : ""}
          </label>
          <textarea
            id="contact-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required={!complaint}
            rows={5}
            placeholder={messagePlaceholder}
            className="w-full resize-y rounded-xl border border-brand-cream-dark bg-brand-ivory px-4 py-3 text-sm text-brand-ink transition-shadow duration-200 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-brand-ink">Attachments (optional)</label>
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
          className="sv-contact-cta inline-flex min-h-[50px] w-full items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-gold transition-opacity hover:opacity-95 disabled:opacity-60"
        >
          {loading ? "Uploading & sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}

export function ContactPageClient() {
  return (
    <main className="relative overflow-hidden bg-brand-cream">
      <span className="sv-contact-blob pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-brand-gold/20 blur-3xl" aria-hidden />
      <span className="sv-contact-blob-delay pointer-events-none absolute -right-16 top-40 h-72 w-72 rounded-full bg-brand-sage/20 blur-3xl" aria-hidden />
      <span className="pointer-events-none absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-brand-terra/10 blur-3xl" aria-hidden />

      <div className="page-shell relative z-[1] py-8 md:py-12">
        <div className="grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
          <ContactVisual />
          <Suspense fallback={<p className="text-sm text-brand-muted">Loading form…</p>}>
            <ContactFormInner />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
