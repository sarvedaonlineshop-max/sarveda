"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { formatMinorFromPaise } from "@/lib/money";
import type { OrderLineItem } from "@/lib/orders-api";

type ReasonOption = { code: string; label: string };

type ItemDraft = {
  selected: boolean;
  reasonCode: string;
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
  onSubmit: (payload: {
    items: Array<{
      orderItemId: string;
      reasonCode: string;
      otherMessage?: string;
      message?: string;
    }>;
    message?: string;
    photosByIndex: Map<number, File[]>;
  }) => Promise<void>;
};

export function OrderServiceRequestForm({
  orderNumber,
  currency,
  kind,
  title,
  subtitle,
  reasons,
  lineItems,
  backHref,
  onSubmit
}: Props) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>(() =>
    Object.fromEntries(
      lineItems.map((item) => [
        item.id,
        { selected: lineItems.length === 1, reasonCode: "", otherMessage: "", message: "", photos: [], previews: [] }
      ])
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
      if (!draft.photos.length) {
        setError(`Add at least one photo for ${item.title}.`);
        return;
      }
      payloadItems.push({
        orderItemId: item.id,
        reasonCode: draft.reasonCode,
        otherMessage: draft.reasonCode === "other" ? draft.otherMessage : undefined,
        message: draft.message || undefined
      });
      photosByIndex.set(index, draft.photos);
    }

    setSubmitting(true);
    try {
      await onSubmit({
        items: payloadItems,
        message: overallMessage,
        photosByIndex
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
        <p className="mt-3 text-xs text-brand-muted">
          Select the item(s) you want to {kind === "cancel" ? "cancel" : "return"}. Each item needs its own reason and
          photos.
        </p>
      </div>

      <div className="space-y-4">
        {lineItems.map((item) => {
          const draft = drafts[item.id];
          const isOther = draft?.reasonCode === "other";
          return (
            <article
              key={item.id}
              className={`rounded-2xl border bg-white shadow-card transition-colors ${
                draft?.selected ? "border-brand-forest/40 ring-1 ring-brand-forest/10" : "border-brand-cream-dark"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3 border-b border-brand-cream-dark px-4 py-4 sm:px-5">
                <input
                  type="checkbox"
                  checked={draft?.selected ?? false}
                  onChange={(e) => patchItem(item.id, { selected: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-brand-forest"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-brand-ink">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-brand-muted">
                    Qty {item.quantity}
                    {item.skuSnapshot ? ` · ${item.skuSnapshot}` : ""} ·{" "}
                    {formatMinorFromPaise(item.lineTotalInPaise, currency)}
                  </span>
                </span>
              </label>

              {draft?.selected ? (
                <div className="space-y-4 px-4 py-4 sm:px-5">
                  <fieldset>
                    <legend className="text-sm font-semibold text-brand-ink">Reason for this item</legend>
                    <div className="mt-2 space-y-2">
                      {reasons.map((reason) => (
                        <label
                          key={reason.code}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${
                            draft.reasonCode === reason.code
                              ? "border-brand-forest bg-brand-forest/5"
                              : "border-brand-cream-dark"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`reason-${item.id}`}
                            checked={draft.reasonCode === reason.code}
                            onChange={() => patchItem(item.id, { reasonCode: reason.code })}
                            className="mt-0.5 accent-brand-forest"
                          />
                          <span className="text-sm text-brand-ink">{reason.label}</span>
                        </label>
                      ))}
                    </div>
                    {isOther ? (
                      <textarea
                        rows={2}
                        value={draft.otherMessage}
                        onChange={(e) => patchItem(item.id, { otherMessage: e.target.value })}
                        placeholder="Please describe (optional)"
                        className="mt-3 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm"
                      />
                    ) : null}
                  </fieldset>

                  <div>
                    <label className="text-sm font-medium text-brand-ink">
                      Note for this item <span className="text-brand-muted">(optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={draft.message}
                      onChange={(e) => patchItem(item.id, { message: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-brand-ink">
                      Photos for this item <span className="text-[#993C1D]">*</span>
                    </p>
                    <label className="mt-2 flex min-h-[96px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-cream-dark bg-brand-cream/30 px-3 py-4">
                      <span className="text-sm font-medium text-brand-forest">Add photos</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(e) => {
                          handleItemPhotos(item.id, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {draft.previews.length ? (
                      <ul className="mt-2 grid grid-cols-4 gap-2">
                        {draft.previews.map((src, i) => (
                          <li key={src} className="relative aspect-square overflow-hidden rounded-lg border">
                            <Image src={src} alt="" fill className="object-cover" unoptimized />
                            <button
                              type="button"
                              onClick={() => removeItemPhoto(item.id, i)}
                              className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="rounded-2xl border border-brand-cream-dark bg-white p-5 shadow-card">
        <label className="block text-sm font-semibold text-brand-ink">
          Overall message <span className="font-normal text-brand-muted">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={overallMessage}
          onChange={(e) => setOverallMessage(e.target.value)}
          className="mt-2 w-full rounded-xl border border-brand-cream-dark px-3 py-2 text-sm"
        />
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
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-brand-forest px-6 text-sm font-semibold text-brand-cream disabled:opacity-60 sm:flex-none"
        >
          {submitting ? "Submitting…" : "Submit request"}
        </button>
        <Link
          href={backHref}
          className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-brand-forest/25 px-6 text-sm font-semibold text-brand-forest"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
