"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type ReasonOption = { code: string; label: string };

type Props = {
  orderNumber: string;
  kind: "cancel" | "refund";
  title: string;
  subtitle: string;
  reasons: readonly ReasonOption[];
  backHref: string;
  onSubmit: (payload: {
    reasonCode: string;
    otherMessage?: string;
    message?: string;
    photos: File[];
  }) => Promise<void>;
};

export function OrderServiceRequestForm({
  orderNumber,
  kind,
  title,
  subtitle,
  reasons,
  backHref,
  onSubmit
}: Props) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState("");
  const [otherMessage, setOtherMessage] = useState("");
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isOther = reasonCode === "other";

  const photoHint = useMemo(
    () =>
      kind === "cancel"
        ? "Upload clear photos of the item(s) in your order. At least one photo is required."
        : "Upload photos showing the issue with your item. At least one photo is required.",
    [kind]
  );

  function handlePhotosChange(files: FileList | null) {
    if (!files?.length) return;
    const next = [...photos, ...Array.from(files)].slice(0, 8);
    setPhotos(next);
    setPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return next.map((f) => URL.createObjectURL(f));
    });
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!reasonCode) {
      setError("Please select a reason.");
      return;
    }
    if (!photos.length) {
      setError("Please add at least one photo.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        reasonCode,
        otherMessage: isOther ? otherMessage : undefined,
        message,
        photos
      });
      setDone(true);
      setTimeout(() => router.push("/profile"), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-brand-cream-dark bg-white p-8 text-center shadow-card">
        <p className="text-3xl" aria-hidden="true">
          ✓
        </p>
        <h2 className="mt-3 font-serif text-xl font-semibold text-brand-ink">Request submitted</h2>
        <p className="mt-2 text-sm text-brand-muted">
          Your refund or cancellation is waiting for approval. We will email you once our team reviews it.
        </p>
        <Link
          href="/profile"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream"
        >
          Back to My account
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <div className="rounded-2xl border border-brand-cream-dark bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Order {orderNumber}</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-brand-ink">{title}</h1>
        <p className="mt-2 text-sm text-brand-muted">{subtitle}</p>
      </div>

      <fieldset className="rounded-2xl border border-brand-cream-dark bg-white p-5 shadow-card sm:p-6">
        <legend className="px-1 text-sm font-semibold text-brand-ink">Select a reason</legend>
        <div className="mt-3 space-y-2">
          {reasons.map((reason) => (
            <label
              key={reason.code}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                reasonCode === reason.code
                  ? "border-brand-forest bg-brand-forest/5"
                  : "border-brand-cream-dark hover:border-brand-forest/30"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={reason.code}
                checked={reasonCode === reason.code}
                onChange={() => setReasonCode(reason.code)}
                className="mt-1 accent-brand-forest"
              />
              <span className="text-sm text-brand-ink">{reason.label}</span>
            </label>
          ))}
        </div>
        {isOther ? (
          <div className="mt-4">
            <label htmlFor="other-message" className="mb-2 block text-sm font-medium text-brand-ink">
              Please describe (optional)
            </label>
            <textarea
              id="other-message"
              rows={3}
              value={otherMessage}
              onChange={(e) => setOtherMessage(e.target.value)}
              className="w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm text-brand-ink focus:border-brand-forest focus:outline-none focus:ring-1 focus:ring-brand-forest"
              placeholder="Tell us a bit more…"
            />
          </div>
        ) : null}
      </fieldset>

      <div className="rounded-2xl border border-brand-cream-dark bg-white p-5 shadow-card sm:p-6">
        <label htmlFor="request-message" className="block text-sm font-semibold text-brand-ink">
          Message <span className="font-normal text-brand-muted">(optional)</span>
        </label>
        <textarea
          id="request-message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-2 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm text-brand-ink focus:border-brand-forest focus:outline-none focus:ring-1 focus:ring-brand-forest"
          placeholder="Anything else we should know?"
        />
      </div>

      <div className="rounded-2xl border border-brand-cream-dark bg-white p-5 shadow-card sm:p-6">
        <p className="text-sm font-semibold text-brand-ink">
          Photos <span className="text-[#993C1D]">*</span>
        </p>
        <p className="mt-1 text-xs text-brand-muted">{photoHint}</p>
        <label className="mt-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-cream-dark bg-brand-cream/40 px-4 py-6 transition-colors hover:border-brand-forest/40 hover:bg-brand-cream/70">
          <span className="text-2xl" aria-hidden="true">
            📷
          </span>
          <span className="mt-2 text-sm font-medium text-brand-forest">Tap to add photos</span>
          <span className="mt-0.5 text-xs text-brand-muted">Up to 8 images</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              handlePhotosChange(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {previews.length ? (
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((src, i) => (
              <li key={src} className="relative aspect-square overflow-hidden rounded-lg border border-brand-cream-dark">
                <Image src={src} alt="" fill className="object-cover" unoptimized />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl bg-[#FCEBEB] px-4 py-3 text-sm text-[#791F1F]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-night disabled:opacity-60 sm:flex-none"
        >
          {submitting ? "Submitting…" : "Submit request"}
        </button>
        <Link
          href={backHref}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-brand-forest/25 px-6 text-sm font-semibold text-brand-forest hover:bg-brand-forest/5"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
