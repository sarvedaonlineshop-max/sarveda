"use client";

/**
 * One-line UAT notice on accounting admin pages.
 * Hide after go-live with NEXT_PUBLIC_ACCOUNTING_UAT_MODE=0.
 */
export function AccountingUatBanner() {
  const uatOff =
    process.env.NEXT_PUBLIC_ACCOUNTING_UAT_MODE === "0" ||
    process.env.NEXT_PUBLIC_ACCOUNTING_UAT_MODE === "false";
  if (uatOff) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-400/80 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <span className="font-semibold">Accounting UAT mode</span>
      <span className="text-amber-900/90">
        {" "}
        — Do not treat reports or journals created before cutover as official company books. Tag
        training docs with{" "}
      </span>
      <code className="rounded bg-amber-100/80 px-1 text-xs">TEST-UAT-ACC-*</code>.
    </div>
  );
}
