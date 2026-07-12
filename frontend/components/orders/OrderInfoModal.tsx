"use client";

import { useEffect, useRef } from "react";

export type CancellationCustomerReason = {
  itemName: string;
  reasonLabel: string;
  message?: string | null;
};

type Props = {
  open: boolean;
  title: string;
  description: string;
  occurredAt?: string | null;
  customerReasons?: CancellationCustomerReason[];
  onClose: () => void;
};

export function OrderInfoModal({
  open,
  title,
  description,
  occurredAt,
  customerReasons,
  onClose
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(100%,28rem)] max-w-lg rounded-2xl border border-brand-cream-dark bg-white p-0 text-brand-ink shadow-xl backdrop:bg-black/40"
    >
      <div className="border-b border-brand-cream-dark bg-brand-cream/50 px-5 py-4">
        <h2 className="font-serif text-lg font-semibold text-brand-ink">{title}</h2>
        {occurredAt ? (
          <p className="mt-1 text-xs text-brand-muted">
            {new Date(occurredAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </p>
        ) : null}
      </div>
      <div className="px-5 py-4 text-sm leading-relaxed text-brand-ink">
        {customerReasons?.length ? (
          <ul className="space-y-3">
            {customerReasons.map((r, i) => (
              <li key={`${r.itemName}-${i}`} className="rounded-lg border border-brand-cream-dark/80 bg-brand-cream/30 px-3 py-2.5">
                <p className="font-semibold text-brand-ink">{r.itemName}</p>
                <p className="mt-0.5 text-brand-ink/90">{r.reasonLabel}</p>
                {r.message?.trim() ? (
                  <p className="mt-1 text-xs text-brand-muted">{r.message.trim()}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="whitespace-pre-line">{description}</p>
        )}
      </div>
      <div className="flex justify-end border-t border-brand-cream-dark px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-brand-forest px-5 text-sm font-semibold text-brand-cream"
        >
          Close
        </button>
      </div>
    </dialog>
  );
}
