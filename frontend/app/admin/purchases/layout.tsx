"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminAccountingNav } from "@/components/admin/accounting/AdminAccountingNav";
import { AccountingUatBanner } from "@/components/admin/accounting/AccountingUatBanner";
import { AdminPurchasesHeader, AdminPurchasesNav } from "@/components/admin/purchases/AdminPurchasesNav";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { isAccountingEnabled } from "@/lib/accounting-api";
import { isAccountingEmailAllowed } from "@/lib/accounting-access";
import { isPurchasesEnabled } from "@/lib/purchases-api";

export default function AdminPurchasesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAdminUser();
  const purchasesOn = isPurchasesEnabled();
  const accountingOn = isAccountingEnabled() && isAccountingEmailAllowed(user?.email);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  if (!checked) return null;

  if (!purchasesOn && !accountingOn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminPurchasesHeader title="Purchases (preview)" subtitle="Module gated until enabled on staging." />
        <button type="button" onClick={() => router.push("/admin")} className="text-sm text-[#1e3a2f] underline">
          Back to dashboard
        </button>
      </div>
    );
  }

  if (accountingOn && purchasesOn) {
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

  if (!purchasesOn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminPurchasesHeader title="Purchases ops unavailable" />
        <button type="button" onClick={() => router.push("/admin")} className="text-sm text-[#1e3a2f] underline">
          Back to dashboard
        </button>
      </div>
    );
  }

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
