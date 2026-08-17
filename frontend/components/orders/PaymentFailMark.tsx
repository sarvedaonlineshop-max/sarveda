"use client";

import type { PaymentOutcome } from "@/lib/payment-outcome";

const BITS = [
  { dx: "-40px", dy: "-36px", delay: "0ms" },
  { dx: "44px", dy: "-32px", delay: "50ms" },
  { dx: "-26px", dy: "38px", delay: "80ms" },
  { dx: "34px", dy: "40px", delay: "20ms" },
  { dx: "0px", dy: "-46px", delay: "100ms" }
] as const;

const THEME: Record<
  PaymentOutcome,
  { mark: string; glow: string; bit: string }
> = {
  dismiss: {
    mark: "from-[#8a7060] to-[#4a3f38]",
    glow: "bg-[#cfa45c]/30",
    bit: "#e9d6ae"
  },
  failed: {
    mark: "from-[#c0453f] to-[#7a1f1c]",
    glow: "bg-[#c0453f]/35",
    bit: "#f4b4ae"
  },
  pending: {
    mark: "from-[#d99a2b] to-[#8a5a12]",
    glow: "bg-[#fac775]/40",
    bit: "#faeeda"
  }
};

export function PaymentFailMark({
  outcome,
  className = ""
}: {
  outcome: PaymentOutcome;
  className?: string;
}) {
  const theme = THEME[outcome];
  const markAnim =
    outcome === "failed" ? "sv-fail-mark sv-fail-shake" : outcome === "pending" ? "sv-fail-mark sv-fail-pulse" : "sv-fail-mark";

  return (
    <span className={`relative mx-auto inline-flex h-24 w-24 items-center justify-center ${className}`}>
      <span className={`sv-fail-ring absolute inset-0 rounded-full ${theme.glow}`} aria-hidden />
      <span
        className="sv-fail-ring absolute inset-[-6px] rounded-full border-2 border-white/25"
        style={{ animationDelay: "0.22s" }}
        aria-hidden
      />
      {BITS.map((bit, i) => (
        <span
          key={i}
          className="sv-fail-spark absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: theme.bit,
            ["--dx" as string]: bit.dx,
            ["--dy" as string]: bit.dy,
            animationDelay: bit.delay
          }}
          aria-hidden
        />
      ))}
      <span
        className={`${markAnim} relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${theme.mark} shadow-lg ring-4 ring-white/90`}
      >
        <svg viewBox="0 0 24 24" className="h-11 w-11 text-white" fill="none" aria-hidden>
          <circle
            className="sv-fail-circle"
            cx="12"
            cy="12"
            r="10"
            stroke="rgba(255,253,247,0.45)"
            strokeWidth="1.6"
          />
          <path
            className="sv-fail-x-a"
            d="M8.2 8.2 15.8 15.8"
            stroke="#fffdf7"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <path
            className="sv-fail-x-b"
            d="M15.8 8.2 8.2 15.8"
            stroke="#fffdf7"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}
