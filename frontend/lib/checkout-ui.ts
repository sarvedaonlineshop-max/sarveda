/** Shared checkout/cart visual tokens (Phase 8 theme). */
export const checkoutLabelClass =
  "mb-1 block text-[10px] font-light uppercase tracking-[0.12em] text-brand-mid";

export const checkoutInputClass =
  "min-h-[48px] w-full rounded-[10px] border border-[rgba(196,176,232,0.3)] bg-brand-bg px-3 text-brand-ink focus:border-brand-lavender-mid focus:outline-none focus:ring-1 focus:ring-[rgba(155,130,204,0.35)]";

export const checkoutFormBlockClass =
  "rounded-[18px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory p-5 md:p-6";

export const checkoutSummaryBoxClass =
  "rounded-[18px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory p-6";

export const paymentOptionClass = (selected: boolean) =>
  `flex cursor-pointer items-start gap-3 rounded-[10px] border p-3 transition-colors ${
    selected
      ? "border-brand-violet bg-brand-bg ring-1 ring-brand-violet"
      : "border-[rgba(196,176,232,0.3)] hover:border-[rgba(196,176,232,0.4)]"
  }`;
