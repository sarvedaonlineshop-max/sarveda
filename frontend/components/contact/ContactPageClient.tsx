"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { fetchMe } from "@/lib/auth-client";
import { EnquiryFilePicker } from "@/components/enquiries/EnquiryFilePicker";
import { submitEnquiry } from "@/lib/enquiry-api";
import { customerPhoneDisplay, customerPhoneTelHref } from "@/lib/enquiry";
import { ENQUIRY_SUBJECT_OPTIONS, type EnquirySubjectValue } from "@/lib/enquiry-subjects";

const inputCls =
  "min-h-[42px] w-full rounded-xl border border-brand-cream-dark bg-brand-ivory px-3 text-sm text-brand-ink focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/25";

function ContactFormInner() {
  const search = useSearchParams();
  const presetOrder = search.get("orderNumber")?.trim() ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subjectCategory, setSubjectCategory] = useState<EnquirySubjectValue>(
    presetOrder ? "ORDER" : "OTHER"
  );
  const [orderNumber, setOrderNumber] = useState(presetOrder);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);

  useEffect(() => {
    setOrderNumber(presetOrder);
    if (presetOrder) setSubjectCategory("ORDER");
  }, [presetOrder]);

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
        message: message.trim(),
        orderNumber:
          subjectCategory === "ORDER" ? orderNumber.trim() || undefined : orderNumber.trim() || undefined,
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
      <div className="rounded-2xl border border-brand-sage/25 bg-brand-cream p-8 text-center">
        <p className="text-lg font-semibold text-brand-forest">Message sent</p>
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
              href="/profile"
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
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      {presetOrder ? (
        <p className="rounded-xl border border-brand-gold-pale/60 bg-brand-cream px-4 py-3 text-sm text-brand-ink">
          Order reference: <span className="font-mono font-medium">{presetOrder}</span>
        </p>
      ) : null}

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
            className={inputCls}
          />
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
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="contact-order" className="mb-2 block text-sm font-medium text-brand-ink">
            Order number {subjectCategory === "ORDER" ? "" : "(optional)"}
          </label>
          <input
            id="contact-order"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="SRV-20260600001"
            className={`${inputCls} font-mono`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-2 block text-sm font-medium text-brand-ink">
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={4}
          placeholder="Tell us how we can help…"
          className="w-full resize-y rounded-xl border border-brand-cream-dark bg-brand-ivory px-4 py-3 text-sm text-brand-ink focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/25"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-brand-ink">Attachments (optional)</label>
        <p className="mb-2 text-xs text-brand-muted">
          Photos, PDF, Word, audio, or video. After you pick files, they appear in the list below.
        </p>
        <EnquiryFilePicker
          files={files}
          onChange={setFiles}
          onError={setError}
          disabled={loading}
        />
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night disabled:opacity-60 sm:w-auto"
      >
        {loading ? "Uploading & sending…" : "Send message"}
      </button>
    </form>
  );
}

export function ContactPageClient() {
  return (
    <>
      <div className="border-b border-brand-cream-dark/60 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 md:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-gold">Support</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-brand-ink md:text-[1.65rem]">
            💬 Need help?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted">
            📧 Questions about an order, delivery, or a product? Email us at{" "}
            <a href="mailto:care@sarveda.com" className="font-medium text-brand-gold hover:text-brand-forest">
              care@sarveda.com
            </a>{" "}
            — we usually reply within 1–2 business days. 📞 Call or WhatsApp{" "}
            <a href={customerPhoneTelHref()} className="font-medium text-brand-gold hover:text-brand-forest">
              {customerPhoneDisplay()}
            </a>
            .
          </p>
        </div>
      </div>

      <main className="bg-brand-cream px-4 py-6 sm:px-6 md:py-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-brand-cream-dark bg-white p-5 shadow-card sm:p-6">
          <Suspense fallback={<p className="text-sm text-brand-muted">Loading form…</p>}>
            <ContactFormInner />
          </Suspense>
        </div>

        <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-brand-muted">
          Prefer email?{" "}
          <a href="mailto:care@sarveda.com" className="font-medium text-brand-gold hover:text-brand-forest">
            care@sarveda.com
          </a>
        </p>
      </main>
    </>
  );
}
