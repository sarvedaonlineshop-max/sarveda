"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** Mask middle digits: +918019553132 → +91xxxxx3132 (keeps country-ish prefix + last 4). */
export function maskPhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return "xxxxxx";

  const last4 = digits.slice(-4);
  const prefixLen = Math.min(3, Math.max(0, digits.length - 7));
  const prefix = digits.slice(0, prefixLen);
  const maskedLen = Math.max(4, digits.length - prefixLen - 4);
  const hasPlus = trimmed.startsWith("+");
  return `${hasPlus ? "+" : ""}${prefix}${"x".repeat(maskedLen)}${last4}`;
}

type Props = {
  phone: string | null | undefined;
  className?: string;
  /** Lighter icon color for dark headers */
  light?: boolean;
};

export function MaskedPhoneReveal({ phone, className, light }: Props) {
  const [revealed, setRevealed] = useState(false);
  const value = (phone ?? "").trim();
  if (!value) return null;

  const display = revealed ? value : maskPhoneNumber(value);
  const iconColor = light
    ? "text-[#e9d6ae] hover:text-white hover:bg-white/15"
    : "text-stone-500 hover:text-[#1c352a]";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <span className="font-mono tabular-nums">{display}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRevealed((v) => !v);
        }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition ${iconColor}`}
        title={revealed ? "Hide number" : "Show number"}
        aria-label={revealed ? "Hide customer number" : "Show customer number"}
      >
        {revealed ? <EyeOff size={15} strokeWidth={2.25} /> : <Eye size={15} strokeWidth={2.25} />}
      </button>
    </span>
  );
}
