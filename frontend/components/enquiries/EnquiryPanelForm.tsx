"use client";

import { FormEvent, useState } from "react";

import { submitEnquiry } from "@/lib/enquiry-api";

type Props = {
  source?: "CORPORATE" | "INSIGHTS";
  title?: string;
  subtitle?: string;
};

export function EnquiryPanelForm({
  source = "CORPORATE",
  title = "Get in touch",
  subtitle = "Share your details and our team will reply within 24 hours."
}: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const result = await submitEnquiry({
        source,
        subjectCategory: source === "CORPORATE" ? "CORPORATE" : "OTHER",
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? "") || undefined,
        message: String(data.get("message") ?? "")
      });
      setEmail(String(data.get("email") ?? ""));
      setSubmitted(true);
      form.reset();
      void result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <p className="rounded-xl bg-[#f0f7f4] px-6 py-8 text-center text-stone-700">
        Thank you. We will reply to <strong>{email}</strong> within 24 hours.
      </p>
    );
  }

  return (
    <div>
      <h3 className="font-serif text-xl font-semibold text-stone-900">{title}</h3>
      <p className="mt-1 text-sm text-stone-600">{subtitle}</p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-5 space-y-4">
        <input
          name="name"
          required
          placeholder="Your name"
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="Email address"
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
        />
        <input
          name="phone"
          type="tel"
          placeholder="Phone (optional)"
          className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
        />
        <textarea
          name="message"
          required
          rows={4}
          placeholder="Your message"
          className="w-full resize-y rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-[#108967] px-5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send message"}
        </button>
      </form>
    </div>
  );
}
