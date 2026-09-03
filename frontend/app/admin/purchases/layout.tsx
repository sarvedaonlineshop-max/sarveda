"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
        <AdminPurchasesHeader
          title="Purchases"
          subtitle="Purchasing is temporarily unavailable."
        />
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="text-sm text-[#1c352a] underline"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!purchasesOn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminPurchasesHeader title="Purchases unavailable" />
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="text-sm text-[#1c352a] underline"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  // Accounting users: Purchases links live in the main Accounting sidebar.
  if (accountingOn) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4 p-1 font-sans">
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-1 font-sans">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <AdminPurchasesNav />
        <div className="min-w-0 flex-1 space-y-5">{children}</div>
      </div>
    </div>
  );
}
