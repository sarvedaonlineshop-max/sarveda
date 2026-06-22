"use client";

import { useState } from "react";

import { getApiBase } from "@/lib/api";
import { fetchMe } from "@/lib/auth-client";

type Props = {
  productSlug: string;
  variantId: string | null;
};

export function NotifyMeButton({ productSlug, variantId }: Props) {
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const me = await fetchMe();
      const body: { email?: string; variantId?: string | null } = {
        variantId: variantId ?? null
      };
      if (!me?.email) {
        body.email = email.trim();
      }

      const res = await fetch(`${getApiBase()}/api/products/${encodeURIComponent(productSlug)}/notify-stock`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = (await res.json()) as { data?: { message?: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save your request");
      setMessage(json.data?.message ?? "We will notify you when this item is back in stock.");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      {!showForm ? (
        <button
          type="button"
          onClick={() => void (async () => {
            const me = await fetchMe();
            if (me?.email) {
              void submit();
            } else {
              setShowForm(true);
            }
          })()}
          disabled={busy}
          className="w-full rounded-lg border border-[#1e3a2f] bg-[#1e3a2f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#163024] disabled:opacity-60"
        >
          {busy ? "Saving…" : "Notify me when available"}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-stone-700">Enter your email and we will notify you when this item is back in stock.</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !email.trim()}
              onClick={() => void submit()}
              className="flex-1 rounded-lg bg-[#1e3a2f] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Notify me"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
