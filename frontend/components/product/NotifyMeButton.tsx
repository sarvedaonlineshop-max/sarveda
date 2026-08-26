"use client";

import { useState } from "react";

import { getApiBase } from "@/lib/api";
import { fetchMe } from "@/lib/auth-client";

type Props = {
  productSlug: string;
  variantId: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function NotifyMeButton({ productSlug, variantId }: Props) {
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(guestEmail?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const me = await fetchMe();
      const body: { email?: string; variantId?: string | null } = {
        variantId: variantId ?? null
      };
      const resolvedEmail = me?.email ?? guestEmail?.trim() ?? email.trim();
      if (!me?.email) {
        if (!resolvedEmail || !isValidEmail(resolvedEmail)) {
          throw new Error("Please enter a valid email address.");
        }
        body.email = resolvedEmail;
      }

      const res = await fetch(`${getApiBase()}/api/products/${encodeURIComponent(productSlug)}/notify-stock`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = (await res.json()) as { data?: { message?: string }; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save your request");
      setConfirmed(true);
      setShowForm(false);
      setMessage(
        json.data?.message ??
          "You're on the list — we'll email you as soon as this item is back in stock."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (confirmed) {
    return (
      <div className="rounded-xl border border-brand-forest/20 bg-brand-cream/60 p-4">
        <p className="text-sm font-semibold text-brand-forest">Request saved</p>
        <p className="mt-1 text-sm text-brand-ink/80">
          {message ?? "We'll notify you when this item is back in stock."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand-cream-dark bg-brand-ivory p-4">
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
          className="w-full rounded-lg border border-brand-forest bg-brand-forest px-4 py-3 text-sm font-semibold text-brand-cream hover:bg-brand-forest/90 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Notify me when available"}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-brand-ink/80">
            Enter your email and we will notify you when this item is back in stock.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-brand-cream-dark bg-white px-3 py-2 text-sm text-brand-ink"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !isValidEmail(email)}
              onClick={() => void submit(email)}
              className="flex-1 rounded-lg bg-brand-forest px-3 py-2 text-sm font-semibold text-brand-cream disabled:opacity-50"
            >
              {busy ? "Saving…" : "Notify me"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="rounded-lg border border-brand-cream-dark px-3 py-2 text-sm text-brand-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && !confirmed ? <p className="mt-2 text-sm text-brand-forest">{message}</p> : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
