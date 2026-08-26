"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPurchasesHeader, AdminPurchasesNav } from "@/components/admin/purchases/AdminPurchasesNav";
import { isPurchasesEnabled } from "@/lib/purchases-api";

export default function AdminPurchasesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const enabled = isPurchasesEnabled();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, [enabled]);

  if (!checked) return null;

  if (!enabled) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminPurchasesHeader title="Purchases (preview)" subtitle="Module gated until enabled on staging." />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Set <code className="text-xs">NEXT_PUBLIC_PURCHASES_ENABLED=1</code> on Vercel and{" "}
          <code className="text-xs">PURCHASES_MODULE_ENABLED=1</code> on the backend, then redeploy to test
          Vendors, POs, Bills, and Expenses here.
        </div>
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
