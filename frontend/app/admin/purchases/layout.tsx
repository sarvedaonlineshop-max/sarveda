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
    if (!enabled) return;
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
    <div className="mx-auto max-w-[1400px] space-y-5 p-1 font-sans">
      <AdminPurchasesHeader
        title="Purchases"
        subtitle="Sarveda operational master — vendors, POs, bills & expenses. Zoho gets accounting docs only."
      />
      <AdminPurchasesNav />
      {children}
    </div>
  );
}
