"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { adminTheme } from "@/lib/admin-theme";

/** Shared accounting presentation tokens. */
export const accountingUi = {
  forest: adminTheme.primary,
  forestHover: adminTheme.primaryHover,
  gold: adminTheme.accent,
  cream: "#faf5ec",
  workspace: adminTheme.workspaceBg,
  card: adminTheme.cardBg,
  border: adminTheme.cardBorder,
  text: adminTheme.text,
  muted: adminTheme.textMuted,
  radius: "10px",
  transition: "140ms cubic-bezier(0.22, 1, 0.36, 1)"
} as const;

export function AccountingPageHeader({
  title,
  subtitle,
  meta
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1
          className="text-[26px] font-semibold leading-tight tracking-tight"
          style={{ color: accountingUi.forest }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-2xl text-sm leading-relaxed" style={{ color: accountingUi.muted }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {meta ? (
        <div className="shrink-0 text-right text-xs" style={{ color: accountingUi.muted }}>
          {meta}
        </div>
      ) : null}
    </div>
  );
}

export function AccountingSectionHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold" style={{ color: accountingUi.text }}>
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-xs" style={{ color: accountingUi.muted }}>
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function AccountingSectionCard({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`admin-surface rounded-[10px] border bg-white p-4 sm:p-5 ${className}`}
      style={{ borderColor: accountingUi.border }}
    >
      {children}
    </section>
  );
}

export function AccountingMetricCard({
  label,
  value,
  hint,
  href,
  unavailable,
  icon,
  emphasis,
  titleAttr
}: {
  label: string;
  value?: string;
  hint?: string;
  href?: string;
  unavailable?: boolean;
  icon?: ReactNode;
  /** Slightly stronger treatment (e.g. Net Profit). */
  emphasis?: boolean;
  titleAttr?: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.06em]"
          style={{ color: accountingUi.muted }}
        >
          {label}
        </p>
        {icon ? (
          <span
            className="shrink-0 opacity-80"
            style={{ color: emphasis ? accountingUi.forest : accountingUi.gold }}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>
      {unavailable ? (
        <p className="mt-2 text-sm font-medium" style={{ color: accountingUi.muted }}>
          Not available yet
        </p>
      ) : (
        <p
          className={`mt-2 font-bold leading-none tabular-nums tracking-tight ${
            emphasis ? "text-[26px]" : "text-[22px]"
          }`}
          style={{
            color: accountingUi.forest,
            fontVariantNumeric: "tabular-nums"
          }}
        >
          {value}
        </p>
      )}
      {hint ? (
        <p className="mt-2 text-xs leading-snug" style={{ color: accountingUi.muted }}>
          {hint}
        </p>
      ) : null}
    </>
  );

  const base =
    "admin-surface block rounded-[10px] border bg-white p-4 transition-[box-shadow,transform,border-color] duration-150";
  const style: CSSProperties = {
    borderColor: emphasis ? "rgba(28,53,42,0.28)" : accountingUi.border,
    background: emphasis ? "linear-gradient(180deg, #ffffff 0%, #f7faf7 100%)" : undefined,
    boxShadow: emphasis ? "inset 3px 0 0 0 #1c352a" : undefined
  };

  if (href) {
    return (
      <Link
        href={href}
        title={titleAttr}
        className={`${base} hover:border-[#cfc5b8] hover:shadow-sm active:scale-[0.98]`}
        style={style}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={base} style={style} title={titleAttr}>
      {inner}
    </div>
  );
}

export type AccountingBadgeTone = "neutral" | "success" | "warning" | "error" | "info";

const badgeTone: Record<AccountingBadgeTone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  error: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-slate-100 text-slate-700 ring-slate-200"
};

export function AccountingStatusBadge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: AccountingBadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${badgeTone[tone]}`}
    >
      {children}
    </span>
  );
}

export function AccountingAlert({
  tone = "info",
  title,
  children
}: {
  tone?: AccountingBadgeTone;
  title?: string;
  children: ReactNode;
}) {
  const wrap =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-950"
      : tone === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
          : "border-slate-200 bg-slate-50 text-slate-800";
  return (
    <div role="status" className={`rounded-[12px] border px-4 py-3 text-sm ${wrap}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1 text-[13px] leading-relaxed opacity-90" : "leading-relaxed"}>
        {children}
      </div>
    </div>
  );
}

export function AccountingEmptyState({
  title,
  description
}: {
  title: string;
  description?: string;
}) {
  return (
    <div
      className="rounded-[10px] border border-dashed px-4 py-8 text-center"
      style={{ borderColor: accountingUi.border, background: accountingUi.cream }}
    >
      <p className="text-sm font-semibold" style={{ color: accountingUi.text }}>
        {title}
      </p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-xs" style={{ color: accountingUi.muted }}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function AccountingQuickAction({
  href,
  label,
  hint,
  icon
}: {
  href: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-2.5 rounded-[8px] border bg-[#faf5ec]/40 px-3 py-2.5 transition-[transform,box-shadow,border-color,background-color] duration-150 hover:-translate-y-px hover:border-[#cfc5b8] hover:bg-white hover:shadow-sm active:scale-[0.98]"
      style={{ borderColor: accountingUi.border }}
    >
      {icon ? (
        <span
          className="mt-0.5 shrink-0 text-[#b98a3e] transition-colors group-hover:text-[#1c352a]"
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-sm font-semibold" style={{ color: accountingUi.forest }}>
          {label}
        </span>
        {hint ? (
          <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: accountingUi.muted }}>
            {hint}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export type AccBtnVariant = "primary" | "secondary" | "success" | "danger";

export function accountingButtonClass(variant: AccBtnVariant = "primary", compact = false): string {
  const size = compact ? "px-3 py-1.5 text-xs" : "h-10 px-4 text-sm";
  const base = `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-[transform,background-color,box-shadow,opacity] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c352a] ${size}`;
  switch (variant) {
    case "secondary":
      return `${base} border border-[#e0d8ce] bg-white text-[#2c2420] hover:bg-[#faf5ec]`;
    case "success":
      return `${base} bg-emerald-700 text-white hover:bg-emerald-800`;
    case "danger":
      return `${base} bg-red-600 text-white hover:bg-red-700`;
    default:
      return `${base} bg-[#1c352a] text-white hover:bg-[#2d5040]`;
  }
}

export function accountingInputClass(): string {
  return "mt-1 block h-10 w-full min-w-[9.5rem] rounded-lg border border-[#e0d8ce] bg-white px-3 text-sm text-[#2c2420] transition-colors focus:border-[#1c352a] focus:outline-none focus:ring-2 focus:ring-[#1c352a]/20";
}

export function accountingTabClass(active: boolean): string {
  return active
    ? "rounded-md bg-[#1c352a] px-3 py-2 text-sm font-semibold text-white"
    : "rounded-md border border-[#e8e2d9] bg-white px-3 py-2 text-sm font-medium text-[#4a3f38] hover:bg-[#faf5ec]";
}

export function humanizeAccountingStatusCode(code: string): string {
  const map: Record<string, string> = {
    DATA_GAP: "Needs attention",
    FINANCIAL_REPORTING_ENGINE_HEALTHY: "Healthy",
    REVIEW_REQUIRED: "Review required",
    PASS: "Pass",
    WARNING: "Warning",
    FAIL: "Failed",
    STRIPE_SETTLEMENT_NOT_CONFIGURED: "Stripe settlements need review"
  };
  if (map[code]) return map[code];
  return code
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
