"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { fetchMe } from "@/lib/auth-client";
import { EnquiryFilePicker } from "@/components/enquiries/EnquiryFilePicker";
import { submitEnquiry } from "@/lib/enquiry-api";
import { ENQUIRY_SUBJECT_OPTIONS, type EnquirySubjectValue } from "@/lib/enquiry-subjects";

const inputCls =
  "min-h-[48px] w-full rounded-xl border border-stone-200 px-4 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20";

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
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-8 text-center">
        <p className="text-lg font-semibold text-emerald-950">Message sent</p>
        <p className="mt-3 text-sm text-emerald-900">{confirmText}</p>
        <p className="mt-2 text-xs text-emerald-800">We will reply to {email}.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/shop"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-amber-400 hover:bg-stone-700"
          >
            Continue shopping
          </Link>
          {presetOrder ? (
            <Link
              href="/profile"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-medium text-stone-800 hover:bg-stone-50"
            >
              Your orders
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
      {presetOrder ? (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Order reference: <span className="font-mono font-medium">{presetOrder}</span>
        </p>
      ) : null}

      <div>
        <label htmlFor="contact-subject" className="mb-2 block text-sm font-medium text-stone-700">
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

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-2 block text-sm font-medium text-stone-700">
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
          <label htmlFor="contact-email" className="mb-2 block text-sm font-medium text-stone-700">
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

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-phone" className="mb-2 block text-sm font-medium text-stone-700">
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
          <label htmlFor="contact-order" className="mb-2 block text-sm font-medium text-stone-700">
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
        <label htmlFor="contact-message" className="mb-2 block text-sm font-medium text-stone-700">
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={5}
          placeholder="Tell us how we can help…"
          className="w-full resize-y rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Attachments (optional)</label>
        <p className="mb-2 text-xs text-stone-500">
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
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-stone-900 px-6 text-sm font-semibold text-amber-400 hover:bg-stone-700 disabled:opacity-60 sm:w-auto"
      >
        {loading ? "Uploading & sending…" : "Send message"}
      </button>
    </form>
  );
}

export function ContactPageClient() {
  return (
    <main className="min-h-[60vh] bg-stone-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <nav className="text-sm text-stone-500">
          <Link href="/" className="hover:text-sky-700 hover:underline">
            Home
          </Link>
          <span className="mx-2">›</span>
          <span className="text-stone-800">Contact</span>
        </nav>

        <h1 className="mt-4 font-serif text-3xl font-semibold text-stone-900">Need help?</h1>
        <p className="mt-2 text-sm text-stone-600">
          Questions about an order, delivery, or a product? Our team replies by email — usually within 1–2
          business days.
        </p>

        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <Suspense fallback={<p className="text-sm text-stone-500">Loading form…</p>}>
            <ContactFormInner />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-stone-500">
          Prefer email?{" "}
          <a href="mailto:care@sarveda.com" className="font-medium text-sky-700 hover:underline">
            care@sarveda.com
          </a>
        </p>
      </div>
    </main>
  );
}
