"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchOrderPublic } from "@/lib/orders-api";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function TrackOrderModal({ open, onClose }: Props) {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const on = orderNumber.trim();
    const c = contact.trim();
    if (!on || !c) {
      setError("Enter your order number and the email or phone used at checkout.");
      return;
    }
    setLoading(true);
    try {
      const looksLikeEmail = c.includes("@");
      const email = looksLikeEmail ? c.toLowerCase() : c;
      const order = await fetchOrderPublic(on, email, looksLikeEmail ? undefined : c);
      const q = new URLSearchParams({
        orderNumber: order.orderNumber,
        email: order.email
      });
      onClose();
      router.push(`/order/confirmed?${q.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find that order. Check your details.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal aria-labelledby="track-order-title">
      <button type="button" className="absolute inset-0 bg-brand-night/45" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-brand-cream-dark bg-white p-6 shadow-xl">
        <h2 id="track-order-title" className="font-serif text-xl font-semibold text-brand-ink">
          Track my order
        </h2>
        <p className="mt-1.5 text-sm text-brand-muted">
          Enter the order number from your confirmation email, plus the email or phone used at checkout.
        </p>
        <form className="mt-5 space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-brand-ink">Order number</span>
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="SRV-2026070001"
              className="w-full rounded-xl border border-brand-cream-dark bg-brand-ivory px-3 py-2.5 text-sm text-brand-ink focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold/40"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-brand-ink">Email or phone</span>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@email.com or +91…"
              className="w-full rounded-xl border border-brand-cream-dark bg-brand-ivory px-3 py-2.5 text-sm text-brand-ink focus:border-brand-gold focus:outline-none focus:ring-1 focus:ring-brand-gold/40"
              autoComplete="email"
            />
          </label>
          {error ? <p className="text-sm text-brand-terra">{error}</p> : null}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] flex-1 rounded-full border border-brand-forest/15 px-4 text-sm font-medium text-brand-forest hover:bg-brand-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] flex-1 rounded-full bg-brand-gold px-4 text-sm font-semibold text-brand-night hover:bg-[#a37934] disabled:opacity-60"
            >
              {loading ? "Looking up…" : "Find order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
