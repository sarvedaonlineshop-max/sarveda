"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminAccountingNav } from "@/components/admin/accounting/AdminAccountingNav";
import { AccountingUatBanner } from "@/components/admin/accounting/AccountingUatBanner";
import { AdminPurchasesHeader, AdminPurchasesNav } from "@/components/admin/purchases/AdminPurchasesNav";
import { isAccountingEnabled } from "@/lib/accounting-api";
import { isPurchasesEnabled } from "@/lib/purchases-api";

/**
 * Purchases ops pages:
 * - If Accounting/Books is enabled → same left Books rail (Zoho-style), no duplicate OPS item.
 * - Else → standalone Purchases rail (legacy / purchases-only mode).
 */
export default function AdminPurchasesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const purchasesOn = isPurchasesEnabled();
  const accountingOn = isAccountingEnabled();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  if (!checked) return null;

  if (!purchasesOn && !accountingOn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminPurchasesHeader title="Purchases (preview)" subtitle="Module gated until enabled on staging." />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Enable Purchases and/or Accounting flags on Vercel + backend, then redeploy.
        </div>
        <button type="button" onClick={() => router.push("/admin")} className="text-sm text-[#1e3a2f] underline">
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!purchasesOn && accountingOn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminPurchasesHeader
          title="Purchases ops unavailable"
          subtitle="Accounting is on, but PURCHASES_MODULE / NEXT_PUBLIC_PURCHASES_ENABLED is off."
        />
        <button type="button" onClick={() => router.push("/admin/accounting")} className="text-sm text-[#1e3a2f] underline">
          Back to Accounting
        </button>
      </div>
    );
  }

  // Books mode: shared Accounting left nav
  if (accountingOn) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4 p-1 font-sans">
        <AccountingUatBanner />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <AdminAccountingNav />
          <div className="min-w-0 flex-1 space-y-5">{children}</div>
        </div>
      </div>
    );
  }

  // Purchases-only mode
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-1 font-sans">
      <AdminPurchasesHeader
        title="Purchases"
        subtitle="Operational purchasing — vendors, POs, bills & expenses."
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <AdminPurchasesNav />
        <div className="min-w-0 flex-1 space-y-5">{children}</div>
      </div>
    </div>
  );
}
