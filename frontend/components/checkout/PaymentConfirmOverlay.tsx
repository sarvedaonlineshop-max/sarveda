"use client";

type Props = {
  open: boolean;
  mode: "razorpay" | "cod" | "stripe" | "paypal";
};

export function PaymentConfirmOverlay({ open, mode }: Props) {
  if (!open) return null;

  const copy =
    mode === "cod"
      ? { title: "Placing your order", hint: "Saving your COD order — this only takes a moment." }
      : { title: "Confirming your payment", hint: "Please stay on this page while we verify the payment." };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-night/55 px-6 backdrop-blur-[6px]"
      role="alertdialog"
      aria-live="assertive"
      aria-busy="true"
      aria-labelledby="pay-confirm-title"
    >
      <div className="w-full max-w-sm rounded-3xl border border-brand-gold/30 bg-gradient-to-b from-brand-ivory to-brand-cream p-8 text-center shadow-2xl">
        <span className="relative mx-auto flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-brand-gold/20 sv-success-ring" aria-hidden />
          <span className="sv-pay-spinner flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-brand-gold-pale border-t-brand-gold">
            <span className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-sage to-brand-forest" />
          </span>
        </span>
        <h2 id="pay-confirm-title" className="mt-5 font-serif text-2xl font-semibold text-brand-ink">
          {copy.title}
        </h2>
        <p className="mt-2 text-sm text-brand-muted">{copy.hint}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-brand-gold">Sarveda</p>
      </div>
    </div>
  );
}
