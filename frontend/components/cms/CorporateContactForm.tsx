"use client";

import { FormEvent, useState } from "react";

import { getApiBase } from "@/lib/api";

export function CorporateContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyEmail, setReplyEmail] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "");

    try {
      const res = await fetch(`${getApiBase()}/api/contact/corporate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email,
          phone: String(data.get("phone") ?? ""),
          message: String(data.get("query") ?? data.get("message") ?? "")
        })
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Could not send your message. Please email care@sarveda.com.");
      }
      setReplyEmail(email);
      setSubmitted(true);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <p className="rounded-xl bg-[#f0f7f4] px-6 py-8 text-center text-stone-700">
        Thank you. Our corporate wellness team will reply to <strong>{replyEmail}</strong> within 24 hours.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
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
        placeholder="Work email"
        className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
      />
      <input
        name="phone"
        type="tel"
        placeholder="Phone (optional)"
        className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
      />
      <textarea
        name="query"
        required
        rows={4}
        placeholder="Tell us about your team and goals"
        className="w-full resize-y rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-stone-900 px-5 text-sm font-semibold text-amber-50 disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
