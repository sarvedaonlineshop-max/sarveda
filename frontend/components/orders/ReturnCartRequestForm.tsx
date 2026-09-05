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
type MobileStep = "items" | "entry" | "review";

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

  const backendMax = (item: OrderLineItem) => Math.max(0, item.returnEligibility?.maxReturnableQty ?? item.quantity);
  const eligibleItems = useMemo(() => lineItems.filter((item) => backendMax(item) > 0), [lineItems]);
  const totalEligibleUnits = useMemo(() => eligibleItems.reduce((sum, item) => sum + backendMax(item), 0), [eligibleItems]);
  const singleUnitMode = totalEligibleUnits === 1;
  const firstEligible = eligibleItems[0]?.id ?? null;

  const [activeItemId, setActiveItemId] = useState<string | null>(firstEligible);
  const [draft, setDraft] = useState<ReturnEntryDraft>(emptyDraft);
  const [cart, setCart] = useState<ReturnCartEntry[]>([]);
  const [overallMessage, setOverallMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [mobileStep, setMobileStep] = useState<MobileStep>(singleUnitMode ? "entry" : "items");
  const [showSingleConfirm, setShowSingleConfirm] = useState(false);

  const activeItem = lineItems.find((item) => item.id === activeItemId) ?? null;
  const cartQtyByItem = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of cart) totals.set(entry.orderItemId, (totals.get(entry.orderItemId) ?? 0) + entry.qty);
    return totals;
  }, [cart]);
  const totalCartQty = useMemo(() => cart.reduce((sum, entry) => sum + entry.qty, 0), [cart]);

  function availableForCart(item: OrderLineItem) {
    return Math.max(0, backendMax(item) - (cartQtyByItem.get(item.id) ?? 0));
  }

  function selectItem(item: OrderLineItem, moveMobile = false) {
    if (availableForCart(item) <= 0) return;
    draft.previews.forEach((url) => URL.revokeObjectURL(url));
    setActiveItemId(item.id);
    setDraft(emptyDraft());
    setError(null);
    setNotice(null);
    if (moveMobile) setMobileStep("entry");
  }

  function patchDraft(patch: Partial<ReturnEntryDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handlePhotos(files: FileList | null) {
    if (!files?.length) return;
    const availableSlots = Math.max(0, 6 - draft.photos.length);
    const added = Array.from(files).slice(0, availableSlots);
    patchDraft({
      photos: [...draft.photos, ...added],
      previews: [...draft.previews, ...added.map((file) => URL.createObjectURL(file))]
    });
  }

  function removeDraftPhoto(index: number) {
    const url = draft.previews[index];
    if (url) URL.revokeObjectURL(url);
    patchDraft({
      photos: draft.photos.filter((_, i) => i !== index),
      previews: draft.previews.filter((_, i) => i !== index)
    });
  }

  function validateDraft(item: OrderLineItem): { qty: number; resolution: string } | null {
    setError(null);
    const available = availableForCart(item);
    if (available <= 0) {
      setError(`${item.title} has no remaining quantity available for this return request.`);
      return null;
    }
    if (!draft.reasonCode) {
      setError("Choose a reason for return.");
      return null;
    }
    const resolutions = RETURN_RESOLUTION_OPTIONS[draft.reasonCode] ?? [];
    const resolution = draft.requestedResolution || resolutions[0]?.code || "";
    if (!resolution) {
      setError("Choose your preferred solution.");
      return null;
    }
    if (draft.reasonCode === "other" && !draft.otherMessage.trim()) {
      setError("Please tell us what happened.");
      return null;
    }
    if (RETURN_EVIDENCE_REQUIRED.has(draft.reasonCode) && !draft.photos.length) {
      setError(`Add at least one photo for ${item.title}.`);
      return null;
    }
    return { qty: Math.max(1, Math.min(draft.qty, available)), resolution };
  }

  function addToReturnCart(nextStep?: MobileStep) {
    if (!activeItem) return false;
    const valid = validateDraft(activeItem);
    if (!valid) return false;
    const entry: ReturnCartEntry = {
      ...draft,
      id: makeEntryId(),
      orderItemId: activeItem.id,
      qty: valid.qty,
      requestedResolution: valid.resolution
    };
    setCart((current) => [...current, entry]);
    setDraft(emptyDraft());
    setNotice(`${activeItem.title} added to your return cart.`);
    if (nextStep) setMobileStep(nextStep);
    window.setTimeout(() => setNotice(null), 1400);
    return true;
  }

  function addAnotherItemMobile() {
    const draftStarted = Boolean(draft.reasonCode || draft.message || draft.photos.length || draft.otherMessage);
    if (draftStarted) {
      if (!addToReturnCart("items")) return;
    } else if (cart.length) {
      setMobileStep("items");
    } else {
      setError("Complete this return entry first, or go back to choose another item.");
    }
  }

  function reviewMobile() {
    const draftStarted = Boolean(draft.reasonCode || draft.message || draft.photos.length || draft.otherMessage);
    if (draftStarted) {
      if (!addToReturnCart("review")) return;
    } else if (cart.length) {
      setMobileStep("review");
    } else {
      setError("Add at least one return entry before reviewing.");
    }
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

  async function submitEntries(entries: ReturnCartEntry[]) {
    if (!entries.length) {
      setError("Add at least one return entry before submitting.");
      return;
    }
    const photosByIndex = new Map<number, File[]>();
    const items = entries.map((entry, index) => {
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
    setError(null);
    try {
      await onSubmit({ items, message: overallMessage.trim() || undefined, photosByIndex });
      setDone(true);
      setTimeout(() => router.push(backHref), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your return request.");
    } finally {
      setSubmitting(false);
      setShowSingleConfirm(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitEntries(cart);
  }

  function requestSingleSubmit() {
    if (!activeItem) return;
    const valid = validateDraft(activeItem);
    if (!valid) return;
    setShowSingleConfirm(true);
  }

  async function confirmSingleSubmit() {
    if (!activeItem) return;
    const valid = validateDraft(activeItem);
    if (!valid) {
      setShowSingleConfirm(false);
      return;
    }
    await submitEntries([{
      ...draft,
      id: makeEntryId(),
      orderItemId: activeItem.id,
      qty: valid.qty,
      requestedResolution: valid.resolution
    }]);
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-brand-cream-dark bg-white p-8 text-center shadow-card sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-700">✓</div>
        <h2 className="mt-4 text-2xl font-extrabold text-brand-ink">Return request submitted</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-brand-muted">Your return or replacement request has been sent for review. We’ll keep you updated as it moves forward.</p>
        <Link href={backHref} className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream">Back to orders</Link>
      </div>
    );
  }

  const activeAvailable = activeItem ? availableForCart(activeItem) : 0;
  const activePurchased = activeItem ? (activeItem.returnEligibility?.orderedQty ?? activeItem.quantity) : 0;
  const activePreviouslyUnavailable = activeItem ? Math.max(0, activePurchased - backendMax(activeItem)) : 0;
  const activeCartQty = activeItem ? (cartQtyByItem.get(activeItem.id) ?? 0) : 0;
  const resolutions = draft.reasonCode ? (RETURN_RESOLUTION_OPTIONS[draft.reasonCode] ?? []) : [];
  const stepTranslate = mobileStep === "items" ? "translate-x-0" : mobileStep === "entry" ? "-translate-x-1/3" : "-translate-x-2/3";

  const itemList = (mobile = false) => (
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
          <button key={item.id} type="button" disabled={disabled} onClick={() => selectItem(item, mobile)} className={`w-full rounded-2xl border p-4 text-left transition-all ${active ? "border-brand-forest bg-emerald-50/45 ring-2 ring-brand-forest/10" : "border-brand-cream-dark bg-white hover:border-brand-forest/30 hover:shadow-sm"} ${disabled ? "cursor-not-allowed opacity-55" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="font-extrabold text-brand-ink">{item.title}</p><p className="mt-1 text-xs text-brand-muted">{item.skuSnapshot || "SKU unavailable"} · {formatMinorFromPaise(item.lineTotalInPaise, currency)}</p></div>
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${active ? "border-brand-forest bg-brand-forest text-white" : "border-brand-forest/25 bg-white"}`}>{mobile && !disabled ? "→" : active ? "✓" : ""}</span>
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
  );

  const entryEditor = (mobile = false) => activeItem ? (
    <div className="space-y-4 p-4 sm:p-5">
      {mobile && !singleUnitMode ? <button type="button" onClick={() => setMobileStep("items")} className="inline-flex items-center gap-1 text-sm font-bold text-brand-forest">← Choose another item</button> : null}
      <div className="rounded-2xl border border-brand-cream-dark bg-brand-cream/25 p-4">
        <p className="font-extrabold text-brand-ink">{activeItem.title}</p>
        <p className="mt-1 text-xs text-brand-muted">{activeItem.skuSnapshot || "SKU unavailable"} · {formatMinorFromPaise(activeItem.lineTotalInPaise, currency)}</p>
      </div>
      <div className="grid grid-cols-4 divide-x divide-emerald-100 rounded-2xl bg-emerald-50/75 px-2 py-3 text-center">
        <div><span className="block text-[9px] font-bold uppercase text-brand-muted">Purchased</span><b className="text-brand-forest">{activePurchased}</b></div>
        <div><span className="block text-[9px] font-bold uppercase text-brand-muted">Requested</span><b className="text-brand-forest">{activePreviouslyUnavailable}</b></div>
        <div><span className="block text-[9px] font-bold uppercase text-brand-muted">In cart</span><b className="text-brand-forest">{activeCartQty}</b></div>
        <div><span className="block text-[9px] font-bold uppercase text-brand-muted">Remaining</span><b className="text-brand-forest">{activeAvailable}</b></div>
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
      {error && mobile ? <p className="rounded-xl bg-[#FCEBEB] px-3 py-2 text-sm font-semibold text-[#791F1F]">{error}</p> : null}
      {mobile ? singleUnitMode ? (
        <button type="button" onClick={requestSingleSubmit} disabled={submitting} className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand-forest px-5 text-sm font-extrabold text-white shadow-sm disabled:opacity-40">Submit Return Request →</button>
      ) : (
        <div className="space-y-2 pt-1">
          <button type="button" disabled={activeAvailable <= 0} onClick={() => addToReturnCart()} className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-brand-forest px-5 text-sm font-extrabold text-white shadow-sm disabled:opacity-40">🛒 Add to Return Cart</button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={addAnotherItemMobile} className="min-h-[48px] rounded-xl border border-brand-forest/25 bg-white px-3 text-sm font-bold text-brand-forest">＋ Add another item</button>
            <button type="button" onClick={reviewMobile} className="min-h-[48px] rounded-xl border border-brand-forest bg-emerald-50 px-3 text-sm font-bold text-brand-forest">Review & submit →</button>
          </div>
          {cart.length ? <p className="text-center text-xs font-semibold text-brand-muted">{cart.length} {cart.length === 1 ? "entry" : "entries"} · {totalCartQty} unit{totalCartQty === 1 ? "" : "s"} in return cart</p> : null}
        </div>
      ) : (
        <button type="button" disabled={activeAvailable <= 0} onClick={() => addToReturnCart()} className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-brand-forest px-5 text-sm font-extrabold text-white shadow-sm disabled:opacity-40">🛒 Add to Return Cart</button>
      )}
    </div>
  ) : <div className="p-6 text-center text-sm text-brand-muted">Select an eligible item to continue.</div>;

  const cartReview = (mobile = false) => (
    <div className="space-y-3 p-4">
      {mobile ? <button type="button" onClick={() => setMobileStep("entry")} className="inline-flex items-center gap-1 text-sm font-bold text-brand-forest">← Back to return entry</button> : null}
      {!cart.length ? <div className="rounded-2xl border border-dashed border-brand-cream-dark bg-brand-cream/25 p-8 text-center"><div className="text-3xl">↩</div><p className="mt-2 text-sm font-bold text-brand-ink">Your return cart is empty</p></div> : cart.map((entry) => {
        const item = lineItems.find((line) => line.id === entry.orderItemId);
        if (!item) return null;
        const otherQty = cart.filter((row) => row.orderItemId === entry.orderItemId && row.id !== entry.id).reduce((sum, row) => sum + row.qty, 0);
        const maxForEntry = Math.max(1, backendMax(item) - otherQty);
        return (
          <article key={entry.id} className="rounded-2xl border border-brand-cream-dark bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-extrabold text-brand-ink">{item.title}</p><p className="mt-0.5 text-xs text-brand-muted">{item.skuSnapshot || "SKU unavailable"}</p></div><button type="button" onClick={() => removeCartEntry(entry.id)} className="rounded-lg px-2 py-1 text-lg text-red-600 hover:bg-red-50" aria-label={`Remove ${item.title}`}>⌫</button></div>
            <div className="mt-3 space-y-1 text-xs leading-5 text-brand-muted"><p><b className="text-brand-ink">Reason:</b> {reasonLabel(reasons, entry.reasonCode)}</p><p><b className="text-brand-ink">Solution:</b> {resolutionLabel(entry.reasonCode, entry.requestedResolution)}</p>{entry.message ? <p><b className="text-brand-ink">Note:</b> {entry.message}</p> : null}</div>
            {entry.previews.length ? <div className="mt-2 flex gap-1.5">{entry.previews.slice(0, 4).map((src) => <div key={src} className="relative h-10 w-10 overflow-hidden rounded-lg border"><Image src={src} alt="Evidence" fill className="object-cover" unoptimized/></div>)}</div> : null}
            <div className="mt-3 flex items-center justify-between border-t border-brand-cream-dark pt-3"><span className="text-xs font-semibold text-brand-muted">Quantity</span><QtyControl compact value={entry.qty} max={maxForEntry} onChange={(qty) => changeCartQty(entry.id, qty)}/></div>
          </article>
        );
      })}
      {cart.length ? <div className="rounded-2xl bg-emerald-50/70 p-4"><div className="grid grid-cols-2 divide-x divide-emerald-100 text-center"><div><span className="block text-[10px] font-bold uppercase text-brand-muted">Return entries</span><b className="text-xl text-brand-forest">{cart.length}</b></div><div><span className="block text-[10px] font-bold uppercase text-brand-muted">Total quantity</span><b className="text-xl text-brand-forest">{totalCartQty}</b></div></div></div> : null}
      <div><label className="text-xs font-bold text-brand-ink">Anything else you’d like us to know? <span className="font-normal text-brand-muted">(optional)</span></label><textarea rows={2} value={overallMessage} onChange={(event) => setOverallMessage(event.target.value)} placeholder="Overall note for this return request" className="mt-2 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm"/></div>
      {error && mobile ? <p className="rounded-xl bg-[#FCEBEB] px-3 py-2 text-sm font-semibold text-[#791F1F]">{error}</p> : null}
      <button type="submit" disabled={submitting || !cart.length} className="inline-flex min-h-[50px] w-full items-center justify-center rounded-xl bg-brand-forest px-5 text-sm font-extrabold text-white shadow-sm disabled:opacity-40">{submitting ? "Submitting…" : "Submit Return Request →"}</button>
      <p className="text-center text-[11px] leading-5 text-brand-muted">All entries are submitted together as one return case and reviewed item by item.</p>
    </div>
  );

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-5 pb-10">
      <section className="rounded-3xl border border-brand-cream-dark bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Order {orderNumber}</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand-ink md:text-3xl">{title}</h1><p className="mt-2 text-sm leading-6 text-brand-muted">{subtitle}</p></div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {eligibleCount != null ? <div className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-center text-emerald-800"><div className="text-xl font-extrabold">{eligibleCount}</div><div className="text-[10px] font-bold uppercase tracking-wide">Eligible now</div></div> : null}
            <div className="inline-flex items-center gap-2 rounded-2xl border border-brand-forest/10 bg-brand-cream/60 px-4 py-3 text-sm font-semibold text-brand-forest">▣ {returnDeadline ? `Return by ${returnDeadline}` : "7-day return window"}</div>
          </div>
        </div>
      </section>

      <div className="md:hidden">
        {singleUnitMode ? (
          <section className="overflow-hidden rounded-3xl border border-brand-cream-dark bg-white shadow-card">
            <div className="border-b border-brand-cream-dark px-5 py-4"><h2 className="text-xl font-extrabold text-brand-ink">Return or replace this item</h2><p className="mt-1 text-xs text-brand-muted">Only one unit is eligible, so you can submit directly.</p></div>
            {entryEditor(true)}
          </section>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-brand-cream-dark bg-white shadow-card">
            <div className="flex w-[300%] transition-transform duration-300 ease-out" style={{ transform: mobileStep === "items" ? "translateX(0%)" : mobileStep === "entry" ? "translateX(-33.333333%)" : "translateX(-66.666667%)" }}>
              <section className="w-1/3 shrink-0"><div className="border-b border-brand-cream-dark px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">1</span><div><h2 className="text-xl font-extrabold text-brand-ink">Items purchased</h2><p className="text-xs text-brand-muted">Tap an item to continue.</p></div></div></div>{itemList(true)}</section>
              <section className="w-1/3 shrink-0"><div className="border-b border-brand-cream-dark px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">2</span><div><h2 className="text-xl font-extrabold text-brand-ink">Add return entry</h2><p className="text-xs text-brand-muted">Quantity, reason and preferred solution.</p></div></div></div>{entryEditor(true)}</section>
              <section className="w-1/3 shrink-0"><div className="border-b border-brand-cream-dark px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">3</span><div><h2 className="text-xl font-extrabold text-brand-ink">Review & submit</h2><p className="text-xs text-brand-muted">Check everything before submitting.</p></div></div></div>{cartReview(true)}</section>
            </div>
          </div>
        )}
      </div>

      <div className="hidden gap-4 md:grid xl:grid-cols-[0.95fr_1.05fr_1fr]">
        <section className="rounded-3xl border border-brand-cream-dark bg-white shadow-card"><div className="border-b border-brand-cream-dark px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">1</span><div><h2 className="text-xl font-extrabold text-brand-ink">Items purchased</h2><p className="text-xs text-brand-muted">Choose an item to build a return entry.</p></div></div></div>{itemList(false)}</section>
        <section className="rounded-3xl border border-brand-cream-dark bg-white shadow-card"><div className="border-b border-brand-cream-dark px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">2</span><div><h2 className="text-xl font-extrabold text-brand-ink">Add return entry</h2><p className="text-xs text-brand-muted">Add quantity, reason and preferred solution.</p></div></div></div>{entryEditor(false)}</section>
        <section className="rounded-3xl border border-brand-cream-dark bg-white shadow-card xl:sticky xl:top-5 xl:self-start"><div className="flex items-center justify-between gap-3 border-b border-brand-cream-dark px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-forest text-sm font-extrabold text-white">3</span><div><h2 className="text-xl font-extrabold text-brand-ink">Your return cart</h2><p className="text-xs text-brand-muted">Review before submitting.</p></div></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800">{cart.length}</span></div>{cartReview(false)}</section>
      </div>

      {error ? <p className="hidden rounded-xl bg-[#FCEBEB] px-4 py-3 text-sm font-semibold text-[#791F1F] md:block" role="alert">{error}</p> : null}
      <div className="flex"><Link href={backHref} className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-brand-forest/25 bg-white px-5 text-sm font-semibold text-brand-forest hover:bg-brand-cream">← Back to orders</Link></div>

      {showSingleConfirm && activeItem ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-return-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl text-brand-forest">✓</div>
            <h2 id="confirm-return-title" className="mt-3 text-center text-xl font-extrabold text-brand-ink">Confirm return request?</h2>
            <div className="mt-4 rounded-2xl bg-brand-cream/45 p-4 text-sm">
              <p className="font-extrabold text-brand-ink">{activeItem.title}</p>
              <p className="mt-2 text-brand-muted"><b className="text-brand-ink">Qty:</b> 1</p>
              <p className="text-brand-muted"><b className="text-brand-ink">Reason:</b> {reasonLabel(reasons, draft.reasonCode)}</p>
              <p className="text-brand-muted"><b className="text-brand-ink">Solution:</b> {resolutionLabel(draft.reasonCode, draft.requestedResolution || (RETURN_RESOLUTION_OPTIONS[draft.reasonCode]?.[0]?.code ?? ""))}</p>
            </div>
            <p className="mt-3 text-center text-xs leading-5 text-brand-muted">Please confirm that the details above are correct before submitting.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowSingleConfirm(false)} disabled={submitting} className="min-h-[48px] rounded-xl border border-brand-forest/25 bg-white text-sm font-bold text-brand-forest">Go back</button>
              <button type="button" onClick={() => void confirmSingleSubmit()} disabled={submitting} className="min-h-[48px] rounded-xl bg-brand-forest text-sm font-extrabold text-white disabled:opacity-50">{submitting ? "Submitting…" : "Confirm & submit"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
