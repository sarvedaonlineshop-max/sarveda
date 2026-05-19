"use client";

import { FormEvent, useState } from "react";

import { getApiBase } from "@/lib/api";

export function CorporateContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch(`${getApiBase()}/api/contact/corporate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? ""),
          message: String(data.get("query") ?? "")
        })
      });
      const json = (await res.json()) as { success?: boolean; message?: string; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Could not send your message. Please email care@sarveda.com.");
      }
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
        Thank you. Our corporate wellness team will reply within 24 hours.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      <div>
        <label htmlFor="cw-name" className="mb-2 block text-sm font-medium text-stone-800">
          Name
        </label>
        <input
          id="cw-name"
          name="name"
          type="text"
          required
          className="w-full border-0 border-b border-stone-300 bg-transparent py-2 text-stone-900 outline-none focus:border-[#108967]"
        />
      </div>
      <div>
        <label htmlFor="cw-email" className="mb-2 block text-sm font-medium text-stone-800">
          Mail
        </label>
        <input
          id="cw-email"
          name="email"
          type="email"
          required
          className="w-full border-0 border-b border-stone-300 bg-transparent py-2 text-stone-900 outline-none focus:border-[#108967]"
        />
      </div>
      <div>
        <label htmlFor="cw-phone" className="mb-2 block text-sm font-medium text-stone-800">
          Phone
        </label>
        <input
          id="cw-phone"
          name="phone"
          type="tel"
          className="w-full border-0 border-b border-stone-300 bg-transparent py-2 text-stone-900 outline-none focus:border-[#108967]"
        />
      </div>
      <div>
        <label htmlFor="cw-query" className="mb-2 block text-sm font-medium text-stone-800">
          Your query
        </label>
        <textarea
          id="cw-query"
          name="query"
          rows={4}
          required
          className="w-full resize-y border-0 border-b border-stone-300 bg-transparent py-2 text-stone-900 outline-none focus:border-[#108967]"
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-[#108967] px-8 py-3.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-[#0d7353] disabled:opacity-60"
      >
        {loading ? "Sending…" : "Submit"}
      </button>
    </form>
  );
}
