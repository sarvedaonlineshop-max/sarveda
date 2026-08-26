"use client";

/**
 * Prominent UAT warning on every accounting admin page.
 * Shown whenever NEXT_PUBLIC_ACCOUNTING_ENABLED is on, unless explicitly
 * disabled with NEXT_PUBLIC_ACCOUNTING_UAT_MODE=0 (post Phase 7D).
 */
export function AccountingUatBanner() {
  const uatOff =
    process.env.NEXT_PUBLIC_ACCOUNTING_UAT_MODE === "0" ||
    process.env.NEXT_PUBLIC_ACCOUNTING_UAT_MODE === "false";
  if (uatOff) return null;

  return (
    <div
      role="status"
      className="rounded-lg border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm"
    >
      <p className="text-sm font-bold tracking-wide uppercase">Accounting UAT Mode</p>
      <p className="mt-1 text-sm font-medium">Training / Test Data Only</p>
      <p className="mt-1 text-sm">
        Production Accounting Starts <strong>01-Sep-2026</strong>. Do not treat reports or journals
        created before cutover as official company books. Tag training docs with{" "}
        <code className="rounded bg-amber-100 px-1 text-xs">TEST-UAT-ACC-*</code>.
      </p>
    </div>
  );
}
