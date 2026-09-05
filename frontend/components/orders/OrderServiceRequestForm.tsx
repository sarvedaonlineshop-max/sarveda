"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { formatMinorFromPaise } from "@/lib/money";
import type { OrderLineItem } from "@/lib/orders-api";
import {
  RETURN_EVIDENCE_HINT,
  RETURN_EVIDENCE_REQUIRED,
  RETURN_RESOLUTION_OPTIONS
} from "@/lib/order-service-request";

type ReasonOption = { code: string; label: string };

type ItemDraft = {
  selected: boolean;
  reasonCode: string;
  requestedResolution: string;
  qty: number;
  otherMessage: string;
  message: string;
  photos: File[];
  previews: string[];
};

type Props = {
  orderNumber: string;
  currency: string;
  kind: "cancel" | "refund";
  title: string;
  subtitle: string;
  reasons: readonly ReasonOption[];
  lineItems: OrderLineItem[];
  backHref: string;
  eligibleCount?: number;
  returnWindowEndsAt?: string | null;
  onSubmit: (payload: {
    items: Array<{
      orderItemId: string;
      reasonCode: string;
      qty?: number;
      requestedResolution?: string;
      otherMessage?: string;
      message?: string;
    }>;
    message?: string;
    photosByIndex: Map<number, File[]>;
  }) => Promise<void>;
};

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return value === 1 ? singular : pluralValue;
}

function formatReturnDeadline(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatIcon({ kind }: { kind: "bought" | "requested" | "available" }) {
  if (kind === "bought") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 8V6a6 6 0 0 1 12 0v2m-14 0h16l-1 12H5L4 8Z" />
      </svg>
    );
  }
  if (kind === "requested") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path strokeLinecap="round" strokeWidth={1.8} d="M12 7v5l3 2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m8.5 12 2.2 2.2L15.8 9" />
    </svg>
  );
}

export function OrderServiceRequestForm({
  orderNumber,
  currency,
  kind,
  title,
  subtitle,
  reasons,
  lineItems,
  backHref,
  eligibleCount,
  returnWindowEndsAt,
  onSubmit
}: Props) {
  const router = useRouter();
  const isCancel = kind === "cancel";
  const returnDeadline = formatReturnDeadline(returnWindowEndsAt);
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>(() =>
    Object.fromEntries(
      lineItems.map((item) => {
        const maxQty = Math.max(0, item.returnEligibility?.maxReturnableQty ?? item.quantity);
        return [
          item.id,
          {
            selected: lineItems.length === 1 && maxQty > 0,
            reasonCode: "",
            requestedResolution: "",
            qty: 1,
            otherMessage: "",
            message: "",
            photos: [],
            previews: []
          }
        ];
      })
    )
  );
  const [overallMessage, setOverallMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selectedItems = useMemo(
    () => lineItems.filter((item) => drafts[item.id]?.selected),
    [drafts, lineItems]
  );

  function patchItem(itemId: string, patch: Partial<ItemDraft>) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  function handleItemPhotos(itemId: string, files: FileList | null) {
    if (!files?.length) return;
    const current = drafts[itemId];
    if (!current) return;
    const nextPhotos = [...current.photos, ...Array.from(files)].slice(0, 6);
    current.previews.forEach((url) => URL.revokeObjectURL(url));
    patchItem(itemId, {
      photos: nextPhotos,
      previews: nextPhotos.map((f) => URL.createObjectURL(f))
    });
  }

  function removeItemPhoto(itemId: string, index: number) {
    const current = drafts[itemId];
    if (!current) return;
    const removed = current.previews[index];
    if (removed) URL.revokeObjectURL(removed);
    patchItem(itemId, {
      photos: current.photos.filter((_, i) => i !== index),
      previews: current.previews.filter((_, i) => i !== index)
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!selectedItems.length) {
      setError("Select at least one item.");
      return;
    }

    const payloadItems: Array<{
      orderItemId: string;
      reasonCode: string;
      qty?: number;
      requestedResolution?: string;
      otherMessage?: string;
      message?: string;
    }> = [];
    const photosByIndex = new Map<number, File[]>();

    for (let index = 0; index < selectedItems.length; index++) {
      const item = selectedItems[index];
      const draft = drafts[item.id];
      if (!draft.reasonCode) {
        setError(`Choose a reason for ${item.title}.`);
        return;
      }

      if (!isCancel) {
        const resolutions = RETURN_RESOLUTION_OPTIONS[draft.reasonCode] ?? [];
        const resolution = draft.requestedResolution || resolutions[0]?.code;
        if (!resolution) {
          setError(`Choose how you'd like us to help for ${item.title}.`);
          return;
        }
        if (RETURN_EVIDENCE_REQUIRED.has(draft.reasonCode) && !draft.photos.length) {
          setError(`Add at least one photo for ${item.title}.`);
          return;
        }
        const maxQty = item.returnEligibility?.maxReturnableQty ?? item.quantity;
        if (maxQty <= 0) {
          setError(`${item.title} is not currently eligible for return.`);
          return;
        }
        const qty = Math.min(Math.max(1, draft.qty), maxQty);
        payloadItems.push({
          orderItemId: item.id,
          reasonCode: draft.reasonCode,
          qty,
          requestedResolution: resolution,
          otherMessage: draft.reasonCode === "other" ? draft.otherMessage : undefined,
          message: draft.message || undefined
        });
        photosByIndex.set(index, draft.photos);
        continue;
      }

      payloadItems.push({
        orderItemId: item.id,
        reasonCode: draft.reasonCode,
        otherMessage: draft.reasonCode === "other" ? draft.otherMessage : undefined,
        message: isCancel ? undefined : draft.message || undefined
      });
    }

    setSubmitting(true);
    try {
      await onSubmit({
        items: payloadItems,
        message: isCancel ? undefined : overallMessage,
        photosByIndex
      });
      setDone(true);
      setTimeout(() => router.push(backHref), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-brand-cream-dark bg-white p-10 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-700" aria-hidden="true">✓</div>
        <h2 className="mt-4 font-serif text-2xl font-semibold text-brand-ink">Request submitted</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-brand-muted">Your {isCancel ? "cancellation" : "return or replacement"} request is waiting for review. We’ll update you after our team checks it.</p>
        <Link href={backHref} className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream">Back to orders</Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 pb-24">
      <div className="rounded-3xl border border-brand-cream-dark bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Order {orderNumber}</p>
            <h1 className="mt-1 font-serif text-2xl font-semibold text-brand-ink md:text-3xl">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-brand-muted">{subtitle}</p>
          </div>
          {!isCancel ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {eligibleCount != null ? (
                <div className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-center text-emerald-800">
                  <div className="text-xl font-extrabold">{eligibleCount}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide">Eligible now</div>
                </div>
              ) : null}
              <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-brand-forest/10 bg-brand-cream/60 px-4 py-3 text-sm font-semibold text-brand-forest">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" strokeWidth={1.8} /><path d="M8 3v4M16 3v4M4 10h16" strokeWidth={1.8} /></svg>
                {returnDeadline ? `Return by ${returnDeadline}` : "7-day return window"}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        {lineItems.map((item) => {
          const draft = drafts[item.id];
          const isOther = draft?.reasonCode === "other";
          const elig = item.returnEligibility;
          const maxReturnable = elig?.maxReturnableQty ?? item.quantity;
          const purchasedQty = elig?.orderedQty ?? item.quantity;
          const unavailableQty = Math.max(0, purchasedQty - maxReturnable);
          const disabled = !isCancel && maxReturnable <= 0;

          return (
            <article key={item.id} className={`overflow-hidden rounded-3xl border bg-white shadow-card transition-all ${disabled ? "border-brand-cream-dark opacity-70" : draft?.selected ? "border-brand-forest/50 ring-2 ring-brand-forest/10" : "border-brand-cream-dark hover:-translate-y-0.5 hover:border-brand-forest/25 hover:shadow-lg"}`}>
              <label className={`block px-4 py-4 sm:px-5 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <div className="flex items-start gap-4">
                  <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${draft?.selected && !disabled ? "border-brand-forest bg-brand-forest text-white" : "border-brand-forest/30 bg-white"}`}>
                    {draft?.selected && !disabled ? <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="m5 12 4 4L19 6" /></svg> : null}
                  </span>
                  <input type="checkbox" checked={!disabled && (draft?.selected ?? false)} disabled={disabled} onChange={(e) => patchItem(item.id, { selected: e.target.checked })} className="sr-only" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-brand-ink sm:text-lg">{item.title}</p>
                        <p className="mt-1 text-xs text-brand-muted">{item.skuSnapshot ? `${item.skuSnapshot} · ` : ""}{formatMinorFromPaise(item.lineTotalInPaise, currency)}</p>
                      </div>
                      {!isCancel && elig ? (
                        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${maxReturnable > 0 ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}>
                          <span className={`h-2 w-2 rounded-full ${maxReturnable > 0 ? "bg-emerald-500" : "bg-stone-400"}`} />
                          {maxReturnable > 0 ? `${maxReturnable} ${plural(maxReturnable, "item")} eligible` : "No items eligible"}
                        </span>
                      ) : null}
                    </div>

                    {!isCancel && elig ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-3 py-3 text-blue-800">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80"><StatIcon kind="bought" /></span>
                          <div><p className="text-[11px] font-medium uppercase tracking-wide text-blue-600">Purchased</p><p className="text-sm font-bold">{purchasedQty} {plural(purchasedQty, "item")}</p></div>
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-3 py-3 text-amber-800">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80"><StatIcon kind="requested" /></span>
                          <div><p className="text-[11px] font-medium uppercase tracking-wide text-amber-600">Request completed</p><p className="text-sm font-bold">{unavailableQty} {plural(unavailableQty, "item")}</p></div>
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-3 text-emerald-800">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80"><StatIcon kind="available" /></span>
                          <div><p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">Eligible now</p><p className="text-sm font-bold">{maxReturnable} {plural(maxReturnable, "item")}</p></div>
                        </div>
                      </div>
                    ) : null}

                    {disabled && elig?.unavailableReason ? <p className="mt-3 text-xs font-medium text-amber-800">{elig.unavailableReason}</p> : null}
                  </div>
                </div>
              </label>

              {draft?.selected && !disabled ? (
                <div className="space-y-5 border-t border-brand-cream-dark bg-brand-cream/20 px-4 py-5 sm:px-5">
                  {!isCancel ? (
                    <div className="rounded-2xl border border-brand-cream-dark bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><p className="text-sm font-semibold text-brand-ink">How many items?</p><p className="mt-0.5 text-xs text-brand-muted">Maximum {maxReturnable} {plural(maxReturnable, "item")} eligible</p></div>
                        <div className="flex items-center overflow-hidden rounded-full border border-brand-forest/20 bg-white">
                          <button type="button" onClick={() => patchItem(item.id, { qty: Math.max(1, draft.qty - 1) })} disabled={draft.qty <= 1} className="flex h-10 w-10 items-center justify-center text-lg font-semibold text-brand-forest disabled:opacity-30" aria-label={`Decrease quantity for ${item.title}`}>−</button>
                          <span className="min-w-[44px] text-center text-sm font-bold text-brand-ink">{draft.qty}</span>
                          <button type="button" onClick={() => patchItem(item.id, { qty: Math.min(maxReturnable, draft.qty + 1) })} disabled={draft.qty >= maxReturnable} className="flex h-10 w-10 items-center justify-center text-lg font-semibold text-brand-forest disabled:opacity-30" aria-label={`Increase quantity for ${item.title}`}>+</button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <fieldset>
                    <legend className="text-sm font-semibold text-brand-ink">What happened?</legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {reasons.map((reason) => (
                        <label key={reason.code} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${draft.reasonCode === reason.code ? "border-brand-forest bg-brand-forest/5" : "border-brand-cream-dark bg-white hover:border-brand-forest/25"}`}>
                          <input type="radio" name={`reason-${item.id}`} checked={draft.reasonCode === reason.code} onChange={() => patchItem(item.id, { reasonCode: reason.code })} className="mt-0.5 accent-brand-forest" />
                          <span className="text-sm text-brand-ink">{reason.label}</span>
                        </label>
                      ))}
                    </div>
                    {isOther ? <textarea rows={2} value={draft.otherMessage} onChange={(e) => patchItem(item.id, { otherMessage: e.target.value })} placeholder="Please tell us what happened" className="mt-3 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm" /> : null}
                  </fieldset>

                  {!isCancel && draft.reasonCode && (RETURN_RESOLUTION_OPTIONS[draft.reasonCode] ?? []).length > 0 ? (
                    <fieldset>
                      <legend className="text-sm font-semibold text-brand-ink">How would you like us to help?</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {(RETURN_RESOLUTION_OPTIONS[draft.reasonCode] ?? []).map((opt) => (
                          <label key={opt.code} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 ${(draft.requestedResolution || RETURN_RESOLUTION_OPTIONS[draft.reasonCode]?.[0]?.code) === opt.code ? "border-brand-forest bg-brand-forest/5" : "border-brand-cream-dark bg-white"}`}>
                            <input type="radio" name={`resolution-${item.id}`} checked={(draft.requestedResolution || RETURN_RESOLUTION_OPTIONS[draft.reasonCode]?.[0]?.code) === opt.code} onChange={() => patchItem(item.id, { requestedResolution: opt.code })} className="accent-brand-forest" />
                            <span className="text-sm text-brand-ink">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {!isCancel ? (
                    <>
                      <div>
                        <label className="text-sm font-medium text-brand-ink">Anything else about this item? <span className="text-brand-muted">(optional)</span></label>
                        <textarea rows={2} value={draft.message} onChange={(e) => patchItem(item.id, { message: e.target.value })} placeholder="Add any detail that may help us understand the issue" className="mt-1 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-brand-ink">Photos {draft.reasonCode && RETURN_EVIDENCE_REQUIRED.has(draft.reasonCode) ? <span className="text-[#993C1D]">*</span> : <span className="font-normal text-brand-muted">(optional)</span>}</p>
                        {draft.reasonCode && RETURN_EVIDENCE_HINT[draft.reasonCode] ? <p className="mt-1 text-xs text-brand-muted">{RETURN_EVIDENCE_HINT[draft.reasonCode]}</p> : null}
                        <label className="mt-2 flex min-h-[96px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-cream-dark bg-white px-3 py-4 hover:border-brand-forest/30">
                          <svg viewBox="0 0 24 24" className="mb-1 h-6 w-6 text-brand-forest" fill="none" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10.5M8 10l2.5 2.5L14 9l6 7.5M4 20h16" /></svg>
                          <span className="text-sm font-semibold text-brand-forest">Add photos</span><span className="mt-0.5 text-xs text-brand-muted">Up to 6 images</span>
                          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { handleItemPhotos(item.id, e.target.files); e.target.value = ""; }} />
                        </label>
                        {draft.previews.length ? (
                          <ul className="mt-2 grid grid-cols-4 gap-2 lg:grid-cols-6">
                            {draft.previews.map((src, i) => (
                              <li key={src} className="relative aspect-square overflow-hidden rounded-lg border">
                                <Image src={src} alt="Uploaded evidence" fill className="object-cover" unoptimized />
                                <button type="button" onClick={() => removeItemPhoto(item.id, i)} className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white" aria-label="Remove photo">✕</button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {!isCancel ? (
        <div className="rounded-3xl border border-brand-cream-dark bg-white p-5 shadow-card">
          <label className="block text-sm font-semibold text-brand-ink">Anything else you’d like us to know? <span className="font-normal text-brand-muted">(optional)</span></label>
          <textarea rows={3} value={overallMessage} onChange={(e) => setOverallMessage(e.target.value)} placeholder="Add any details that may help us understand your request" className="mt-2 w-full rounded-2xl border border-brand-cream-dark px-3 py-3 text-sm" />
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-[#FCEBEB] px-4 py-3 text-sm text-[#791F1F]" role="alert">{error}</p> : null}

      <div className="sticky bottom-0 z-30 -mx-2 flex flex-wrap items-center gap-3 border-t border-brand-cream-dark bg-white/95 px-3 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur-sm sm:-mx-3 sm:px-4">
        <Link href={backHref} className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-brand-forest/25 bg-white px-6 text-sm font-semibold text-brand-forest transition-colors hover:bg-brand-cream">Back to orders</Link>
        <button type="submit" disabled={submitting || selectedItems.length === 0} className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-brand-forest px-7 text-sm font-semibold text-brand-cream shadow-sm transition-all hover:bg-brand-night hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none">
          {submitting ? "Submitting…" : isCancel ? "Submit cancellation" : "Continue"}
          {!submitting && !isCancel ? <span aria-hidden="true">→</span> : null}
        </button>
        {!selectedItems.length && !isCancel ? <span className="text-xs text-brand-muted">Select at least one item to continue</span> : null}
      </div>
    </form>
  );
}
