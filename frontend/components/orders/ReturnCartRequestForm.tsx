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

type ReturnEntryDraft = {
  qty: number;
  reasonCode: string;
  requestedResolution: string;
  otherMessage: string;
  message: string;
  photos: File[];
  previews: string[];
};

type ReturnCartEntry = ReturnEntryDraft & {
  id: string;
  orderItemId: string;
};

type Props = {
  orderNumber: string;
  currency: string;
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

const emptyDraft = (): ReturnEntryDraft => ({
  qty: 1,
  reasonCode: "",
  requestedResolution: "",
  otherMessage: "",
  message: "",
  photos: [],
  previews: []
});

function formatReturnDeadline(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function reasonLabel(reasons: readonly ReasonOption[], code: string) {
  return reasons.find((reason) => reason.code === code)?.label ?? code.replace(/_/g, " ");
}

function resolutionLabel(reasonCode: string, code: string) {
  return RETURN_RESOLUTION_OPTIONS[reasonCode]?.find((option) => option.code === code)?.label ?? code.replace(/_/g, " ");
}

function makeEntryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function QtyControl({ value, min = 1, max, onChange, compact = false }: { value: number; min?: number; max: number; onChange: (next: number) => void; compact?: boolean }) {
  const size = compact ? "h-8 w-8" : "h-10 w-10";
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border border-brand-forest/15 bg-white shadow-sm">
      <button type="button" className={`${size} text-lg font-semibold text-brand-forest disabled:opacity-25`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span className={`${compact ? "min-w-9" : "min-w-12"} text-center text-sm font-extrabold text-brand-ink`}>{value}</span>
      <button type="button" className={`${size} text-lg font-semibold text-brand-forest disabled:opacity-25`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

export function ReturnCartRequestForm({
  orderNumber,
  currency,
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
  const returnDeadline = formatReturnDeadline(returnWindowEndsAt);
  const firstEligible = lineItems.find((item) => (item.returnEligibility?.maxReturnableQty ?? item.quantity) > 0)?.id ?? null;
  const [activeItemId, setActiveItemId] = useState<string | null>(firstEligible);
  const [draft, setDraft] = useState<ReturnEntryDraft>(emptyDraft);
  const [cart, setCart] = useState<ReturnCartEntry[]>([]);
  const [overallMessage, setOverallMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const activeItem = lineItems.find((item) => item.id === activeItemId) ?? null;
  const cartQtyByItem = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of cart) totals.set(entry.orderItemId, (totals.get(entry.orderItemId) ?? 0) + entry.qty);
    return totals;
  }, [cart]);
  const totalCartQty = useMemo(() => cart.reduce((sum, entry) => sum + entry.qty, 0), [cart]);

  function backendMax(item: OrderLineItem) {
    return Math.max(0, item.returnEligibility?.maxReturnableQty ?? item.quantity);
  }

  function availableForCart(item: OrderLineItem) {
    return Math.max(0, backendMax(item) - (cartQtyByItem.get(item.id) ?? 0));
  }

  function selectItem(item: OrderLineItem) {
    if (availableForCart(item) <= 0) return;
    setActiveItemId(item.id);
    setDraft(emptyDraft());
    setError(null);
    setNotice(null);
  }

  function patchDraft(patch: Partial<ReturnEntryDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handlePhotos(files: FileList | null) {
    if (!files?.length) return;
    const nextPhotos = [...draft.photos, ...Array.from(files)].slice(0, 6);
    const addedPreviews = nextPhotos.slice(draft.photos.length).map((file) => URL.createObjectURL(file));
    patchDraft({ photos: nextPhotos, previews: [...draft.previews, ...addedPreviews].slice(0, 6) });
  }

  function removeDraftPhoto(index: number) {
    const url = draft.previews[index];
    if (url) URL.revokeObjectURL(url);
    patchDraft({
      photos: draft.photos.filter((_, i) => i !== index),
      previews: draft.previews.filter((_, i) => i !== index)
    });
  }

  function addToReturnCart() {
    if (!activeItem) return;
    setError(null);
    setNotice(null);
    const available = availableForCart(activeItem);
    if (available <= 0) {
      setError(`${activeItem.title} has no remaining quantity available for this return cart.`);
      return;
    }
    if (!draft.reasonCode) {
      setError("Choose a reason for return.");
      return;
    }
    const resolutions = RETURN_RESOLUTION_OPTIONS[draft.reasonCode] ?? [];
    const resolution = draft.requestedResolution || resolutions[0]?.code || "";
    if (!resolution) {
      setError("Choose your preferred solution.");
      return;
    }
    if (draft.reasonCode === "other" && !draft.otherMessage.trim()) {
      setError("Please tell us what happened.");
      return;
    }
    if (RETURN_EVIDENCE_REQUIRED.has(draft.reasonCode) && !draft.photos.length) {
      setError(`Add at least one photo for ${activeItem.title}.`);
      return;
    }

    const qty = Math.max(1, Math.min(draft.qty, available));
    setCart((current) => [
      ...current,
      {
        ...draft,
        id: makeEntryId(),
        orderItemId: activeItem.id,
        qty,
        requestedResolution: resolution
      }
    ]);
    setDraft(emptyDraft());
    setNotice(`${activeItem.title} added to your return cart.`);
    window.setTimeout(() => setNotice(null), 1400);
  }

  function removeCartEntry(entryId: string) {
    setCart((current) => {
      const entry = current.find((row) => row.id === entryId);
      entry?.previews.forEach((url) => URL.revokeObjectURL(url));
      return current.filter((row) => row.id !== entryId);
    });
  }

  function changeCartQty(entryId: string, nextQty: number) {
    setCart((current) => {
      const entry = current.find((row) => row.id === entryId);
      if (!entry) return current;
      const item = lineItems.find((line) => line.id === entry.orderItemId);
      if (!item) return current;
      const otherQty = current.filter((row) => row.orderItemId === entry.orderItemId && row.id !== entryId).reduce((sum, row) => sum + row.qty, 0);
      const maxForEntry = Math.max(1, backendMax(item) - otherQty);
      return current.map((row) => row.id === entryId ? { ...row, qty: Math.max(1, Math.min(nextQty, maxForEntry)) } : row);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!cart.length) {
      setError("Add at least one return entry before submitting.");
      return;
    }

    const photosByIndex = new Map<number, File[]>();
    const items = cart.map((entry, index) => {
      photosByIndex.set(index, entry.photos);
      return {
        orderItemId: entry.orderItemId,
        reasonCode: entry.reasonCode,
        qty: entry.qty,
        requestedResolution: entry.requestedResolution,
        otherMessage: entry.reasonCode === "other" ? entry.otherMessage.trim() || undefined : undefined,
        message: entry.message.trim() || undefined
      };
    });

    setSubmitting(true);
    try {
      await onSubmit({ items, message: overallMessage.trim() || undefined, photosByIndex });
      setDone(true);
      setTimeout(() => router.push(backHref), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your return request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-brand-cream-dark bg-white p-10 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-700">✓</div>
        <h2 className="mt-4 text-2xl font-extrabold text-brand-ink">Return request submitted</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-brand-muted">All items in your return cart were sent together as one request. We’ll update you after our team reviews each line.</p>
        <Link href={backHref} className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream">Back to orders</Link>
      </div>
    );
  }

  const activeAvailable = activeItem ? availableForCart(activeItem) : 0;
  const activePurchased = activeItem ? (activeItem.returnEligibility?.orderedQty ?? activeItem.quantity) : 0;
  const activePreviouslyUnavailable = activeItem ? Math.max(0, activePurchased - backendMax(activeItem)) : 0;
  const activeCartQty = activeItem ? (cartQtyByItem.get(activeItem.id) ?? 0) : 0;
  const resolutions = draft.reasonCode ? (RETURN_RESOLUTION_OPTIONS[draft.reasonCode] ?? []) : [];

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 pb-10">
      <section className="rounded-3xl border border-brand-cream-dark bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Order {orderNumber}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-ink md:text-3xl">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-brand-muted">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {eligibleCount != null ? <div className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-center text-emerald-800"><div className="text-xl font-extrabold">{eligibleCount}</div><div className="text-[10px] font-bold uppercase tracking-wide">Eligible now</div></div> : null}
            <div className="inline-flex items-center gap-2 rounded-2xl border border-brand-forest/10 bg-brand-cream/60 px-4 py-3 text-sm font-semibold text-brand-forest">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"><rect x="4" y="5" width="16" height="15" rx="2" strokeWidth={1.8}/><path d="M8 3v4M16 3v4M4 10h16" strokeWidth={1.8}/></svg>
              {returnDeadline ? `Return by ${returnDeadline}` : "7-day return window"}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr_1fr]">
        <section className="rounded-3xl border border-brand-cream-dark bg-white shadow-card">
          <div className="border-b border-brand-cream-dark px-5 py-4">
            <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">1</span><div><h2 className="text-xl font-extrabold text-brand-ink">Items purchased</h2><p className="text-xs text-brand-muted">Choose an item to build a return entry.</p></div></div>
          </div>
          <div className="space-y-3 p-4">
            {lineItems.map((item) => {
              const available = availableForCart(item);
              const purchased = item.returnEligibility?.orderedQty ?? item.quantity;
              const backendAvailable = backendMax(item);
              const alreadyUnavailable = Math.max(0, purchased - backendAvailable);
              const inCart = cartQtyByItem.get(item.id) ?? 0;
              const active = item.id === activeItemId;
              const disabled = available <= 0;
              return (
                <button key={item.id} type="button" disabled={disabled} onClick={() => selectItem(item)} className={`w-full rounded-2xl border p-4 text-left transition-all ${active ? "border-brand-forest bg-emerald-50/45 ring-2 ring-brand-forest/10" : "border-brand-cream-dark bg-white hover:border-brand-forest/30 hover:shadow-sm"} ${disabled ? "cursor-not-allowed opacity-55" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="font-extrabold text-brand-ink">{item.title}</p><p className="mt-1 text-xs text-brand-muted">{item.skuSnapshot || "SKU unavailable"} · {formatMinorFromPaise(item.lineTotalInPaise, currency)}</p></div>
                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${active ? "border-brand-forest bg-brand-forest text-white" : "border-brand-forest/25 bg-white"}`}>{active ? "✓" : ""}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-800"><span className="block text-[10px] font-bold uppercase text-blue-600">Purchased</span><b>{purchased}</b></div>
                    <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800"><span className="block text-[10px] font-bold uppercase text-amber-600">Already requested</span><b>{alreadyUnavailable}</b></div>
                    <div className="rounded-xl bg-brand-cream/60 px-3 py-2 text-brand-ink"><span className="block text-[10px] font-bold uppercase text-brand-muted">In this cart</span><b>{inCart}</b></div>
                    <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800"><span className="block text-[10px] font-bold uppercase text-emerald-600">Available</span><b>{available}</b></div>
                  </div>
                  {disabled && item.returnEligibility?.unavailableReason ? <p className="mt-2 text-xs font-medium text-amber-800">{item.returnEligibility.unavailableReason}</p> : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-brand-cream-dark bg-white shadow-card">
          <div className="border-b border-brand-cream-dark px-5 py-4">
            <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">2</span><div><h2 className="text-xl font-extrabold text-brand-ink">Add return entry</h2><p className="text-xs text-brand-muted">Add quantity, reason and preferred solution.</p></div></div>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            {activeItem ? (
              <>
                <div className="rounded-2xl border border-brand-cream-dark bg-brand-cream/25 p-4">
                  <p className="font-extrabold text-brand-ink">{activeItem.title}</p>
                  <p className="mt-1 text-xs text-brand-muted">{activeItem.skuSnapshot || "SKU unavailable"} · {formatMinorFromPaise(activeItem.lineTotalInPaise, currency)}</p>
                </div>
                <div className="grid grid-cols-4 divide-x divide-emerald-100 rounded-2xl bg-emerald-50/75 px-2 py-3 text-center">
                  <div><span className="block text-[10px] font-bold uppercase text-brand-muted">Purchased</span><b className="text-brand-forest">{activePurchased}</b></div>
                  <div><span className="block text-[10px] font-bold uppercase text-brand-muted">Requested</span><b className="text-brand-forest">{activePreviouslyUnavailable}</b></div>
                  <div><span className="block text-[10px] font-bold uppercase text-brand-muted">In cart</span><b className="text-brand-forest">{activeCartQty}</b></div>
                  <div><span className="block text-[10px] font-bold uppercase text-brand-muted">Remaining</span><b className="text-brand-forest">{activeAvailable}</b></div>
                </div>

                <div>
                  <div className="flex items-center justify-between"><label className="text-sm font-bold text-brand-ink">Quantity to return <span className="text-red-700">*</span></label><span className="text-xs text-brand-muted">Max {activeAvailable}</span></div>
                  <div className="mt-2"><QtyControl value={Math.min(draft.qty, Math.max(1, activeAvailable))} max={Math.max(1, activeAvailable)} onChange={(qty) => patchDraft({ qty })}/></div>
                </div>

                <div>
                  <label className="text-sm font-bold text-brand-ink">Reason for return <span className="text-red-700">*</span></label>
                  <select value={draft.reasonCode} onChange={(event) => patchDraft({ reasonCode: event.target.value, requestedResolution: "" })} className="mt-2 min-h-[46px] w-full rounded-xl border border-brand-cream-dark bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-forest">
                    <option value="">Select a reason</option>
                    {reasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}
                  </select>
                  {draft.reasonCode === "other" ? <textarea rows={2} value={draft.otherMessage} onChange={(event) => patchDraft({ otherMessage: event.target.value })} placeholder="Please tell us what happened" className="mt-2 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm"/> : null}
                </div>

                <div>
                  <label className="text-sm font-bold text-brand-ink">Preferred solution <span className="text-red-700">*</span></label>
                  <select disabled={!draft.reasonCode} value={draft.requestedResolution || resolutions[0]?.code || ""} onChange={(event) => patchDraft({ requestedResolution: event.target.value })} className="mt-2 min-h-[46px] w-full rounded-xl border border-brand-cream-dark bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand-forest disabled:bg-stone-50 disabled:text-stone-400">
                    {!draft.reasonCode ? <option value="">Select a reason first</option> : null}
                    {resolutions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                  </select>
                </div>

                <div>
                  <p className="text-sm font-bold text-brand-ink">Add photos {draft.reasonCode && RETURN_EVIDENCE_REQUIRED.has(draft.reasonCode) ? <span className="text-red-700">*</span> : <span className="font-normal text-brand-muted">(optional)</span>}</p>
                  {draft.reasonCode && RETURN_EVIDENCE_HINT[draft.reasonCode] ? <p className="mt-1 text-xs leading-5 text-brand-muted">{RETURN_EVIDENCE_HINT[draft.reasonCode]}</p> : null}
                  <label className="mt-2 flex min-h-[92px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-cream-dark bg-brand-cream/20 px-3 py-4 text-center hover:border-brand-forest/35">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 text-brand-forest" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 16V4m0 0L8 8m4-4 4 4M5 14v5h14v-5"/></svg>
                    <span className="mt-1 text-sm font-semibold text-brand-forest">Click to upload photos</span><span className="text-xs text-brand-muted">Up to 6 images</span>
                    <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => { handlePhotos(event.target.files); event.target.value = ""; }}/>
                  </label>
                  {draft.previews.length ? <ul className="mt-2 grid grid-cols-5 gap-2">{draft.previews.map((src, index) => <li key={src} className="relative aspect-square overflow-hidden rounded-lg border"><Image src={src} alt="Return evidence" fill className="object-cover" unoptimized/><button type="button" onClick={() => removeDraftPhoto(index)} className="absolute right-1 top-1 rounded-full bg-black/65 px-1.5 text-[10px] text-white">✕</button></li>)}</ul> : null}
                </div>

                <div><label className="text-sm font-bold text-brand-ink">Additional details <span className="font-normal text-brand-muted">(optional)</span></label><textarea rows={3} value={draft.message} onChange={(event) => patchDraft({ message: event.target.value })} placeholder="Tell us anything that may help us understand the issue" className="mt-2 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm"/></div>

                {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">✓ {notice}</p> : null}
                <button type="button" disabled={activeAvailable <= 0} onClick={addToReturnCart} className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-brand-forest px-5 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-brand-night hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
                  <span aria-hidden="true">🛒</span> Add to Return Cart
                </button>
              </>
            ) : <div className="rounded-2xl bg-brand-cream/40 p-6 text-center text-sm text-brand-muted">Select an eligible item from the left to create a return entry.</div>}
          </div>
        </section>

        <section className="rounded-3xl border border-brand-cream-dark bg-white shadow-card xl:sticky xl:top-5 xl:self-start">
          <div className="flex items-center justify-between gap-3 border-b border-brand-cream-dark px-5 py-4">
            <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">3</span><div><h2 className="text-xl font-extrabold text-brand-ink">Your return cart</h2><p className="text-xs text-brand-muted">Review before submitting.</p></div></div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800">{cart.length} {cart.length === 1 ? "entry" : "entries"}</span>
          </div>
          <div className="space-y-3 p-4">
            {!cart.length ? <div className="rounded-2xl border border-dashed border-brand-cream-dark bg-brand-cream/25 p-8 text-center"><div className="text-3xl">↩</div><p className="mt-2 text-sm font-bold text-brand-ink">Your return cart is empty</p><p className="mt-1 text-xs leading-5 text-brand-muted">Choose an item, add quantity and reason, then add it here.</p></div> : cart.map((entry) => {
              const item = lineItems.find((line) => line.id === entry.orderItemId);
              if (!item) return null;
              const otherQty = cart.filter((row) => row.orderItemId === entry.orderItemId && row.id !== entry.id).reduce((sum, row) => sum + row.qty, 0);
              const maxForEntry = Math.max(1, backendMax(item) - otherQty);
              return (
                <article key={entry.id} className="rounded-2xl border border-brand-cream-dark bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-extrabold text-brand-ink">{item.title}</p><p className="mt-0.5 text-xs text-brand-muted">{item.skuSnapshot || "SKU unavailable"}</p></div><button type="button" onClick={() => removeCartEntry(entry.id)} className="rounded-lg px-2 py-1 text-lg text-red-600 hover:bg-red-50" aria-label={`Remove ${item.title} from return cart`}>⌫</button></div>
                  <div className="mt-3 space-y-1 text-xs leading-5 text-brand-muted"><p><b className="text-brand-ink">Reason:</b> {reasonLabel(reasons, entry.reasonCode)}</p><p><b className="text-brand-ink">Solution:</b> {resolutionLabel(entry.reasonCode, entry.requestedResolution)}</p>{entry.message ? <p><b className="text-brand-ink">Note:</b> {entry.message}</p> : null}</div>
                  {entry.previews.length ? <div className="mt-2 flex gap-1.5">{entry.previews.slice(0, 4).map((src) => <div key={src} className="relative h-10 w-10 overflow-hidden rounded-lg border"><Image src={src} alt="Evidence" fill className="object-cover" unoptimized/></div>)}</div> : null}
                  <div className="mt-3 flex items-center justify-between border-t border-brand-cream-dark pt-3"><span className="text-xs font-semibold text-brand-muted">Quantity</span><QtyControl compact value={entry.qty} max={maxForEntry} onChange={(qty) => changeCartQty(entry.id, qty)}/></div>
                </article>
              );
            })}

            {cart.length ? <div className="rounded-2xl bg-emerald-50/70 p-4"><div className="grid grid-cols-2 divide-x divide-emerald-100 text-center"><div><span className="block text-[10px] font-bold uppercase text-brand-muted">Return entries</span><b className="text-xl text-brand-forest">{cart.length}</b></div><div><span className="block text-[10px] font-bold uppercase text-brand-muted">Total quantity</span><b className="text-xl text-brand-forest">{totalCartQty}</b></div></div></div> : null}

            <div><label className="text-xs font-bold text-brand-ink">Anything else you’d like us to know? <span className="font-normal text-brand-muted">(optional)</span></label><textarea rows={2} value={overallMessage} onChange={(event) => setOverallMessage(event.target.value)} placeholder="Overall note for this return request" className="mt-2 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm"/></div>

            <button type="submit" disabled={submitting || !cart.length} className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-brand-forest px-5 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-brand-night hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">{submitting ? "Submitting…" : "Submit Return Request →"}</button>
            <p className="text-center text-[11px] leading-5 text-brand-muted">All return-cart entries are submitted together as one return case and reviewed item by item.</p>
          </div>
        </section>
      </div>

      {error ? <p className="rounded-xl bg-[#FCEBEB] px-4 py-3 text-sm font-semibold text-[#791F1F]" role="alert">{error}</p> : null}
      <div className="flex"><Link href={backHref} className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-forest/25 bg-white px-5 text-sm font-semibold text-brand-forest hover:bg-brand-cream">← Back to orders</Link></div>
    </form>
  );
}
