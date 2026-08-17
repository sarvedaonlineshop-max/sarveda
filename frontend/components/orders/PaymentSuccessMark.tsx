"use client";

import { useEffect } from "react";

import { playPaymentSuccessChime } from "@/lib/payment-success-chime";

const CONFETTI = [
  { dx: "-42px", dy: "-38px", color: "#b98a3e", delay: "0ms" },
  { dx: "46px", dy: "-34px", color: "#48705a", delay: "40ms" },
  { dx: "-28px", dy: "40px", color: "#cfa45c", delay: "70ms" },
  { dx: "36px", dy: "42px", color: "#1c352a", delay: "20ms" },
  { dx: "0px", dy: "-48px", color: "#e9d6ae", delay: "90ms" },
  { dx: "-50px", dy: "8px", color: "#6f997f", delay: "55ms" },
  { dx: "52px", dy: "6px", color: "#b4552d", delay: "30ms" }
] as const;

export function PaymentSuccessMark({
  className = "",
  playSound = false,
  soundKey
}: {
  className?: string;
  playSound?: boolean;
  /** Play the chime once per browser session for this key (usually the order number). */
  soundKey?: string;
}) {
  useEffect(() => {
    if (!playSound) return;
    const lock = soundKey ? `sarveda_pay_chime:${soundKey}` : "";
    if (lock && sessionStorage.getItem(lock)) return;
    void playPaymentSuccessChime(soundKey);
  }, [playSound, soundKey]);
  return (
    <span className={`relative mx-auto inline-flex h-24 w-24 items-center justify-center ${className}`}>
      <span className="sv-success-ring absolute inset-0 rounded-full bg-brand-gold/25" aria-hidden />
      <span
        className="sv-success-ring absolute inset-[-6px] rounded-full border-2 border-brand-sage/40"
        style={{ animationDelay: "0.28s" }}
        aria-hidden
      />
      {CONFETTI.map((bit, i) => (
        <span
          key={i}
          className="sv-success-confetti absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: bit.color,
            ["--dx" as string]: bit.dx,
            ["--dy" as string]: bit.dy,
            animationDelay: bit.delay
          }}
          aria-hidden
        />
      ))}
      <span className="sv-success-mark relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-sage to-brand-forest shadow-lg ring-4 ring-white">
        <svg viewBox="0 0 24 24" className="h-11 w-11 text-brand-gold-pale" fill="none" aria-hidden>
          <circle
            className="sv-success-circle"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            className="sv-success-check"
            d="m8.5 12.2 2.4 2.4 4.7-5.2"
            stroke="#fffdf7"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
}
