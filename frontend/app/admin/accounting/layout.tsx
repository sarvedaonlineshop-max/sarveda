"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminAccountingHeader,
  AdminAccountingNav
} from "@/components/admin/accounting/AdminAccountingNav";
import { AccountingUatBanner } from "@/components/admin/accounting/AccountingUatBanner";
import { isAccountingEnabled } from "@/lib/accounting-api";

export default function AdminAccountingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const enabled = isAccountingEnabled();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  if (!checked) return null;

  if (!enabled) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminAccountingHeader
          title="Accounting (preview)"
          subtitle="Isolated admin workspace — gated until enabled on staging."
        />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Set <code className="text-xs">NEXT_PUBLIC_ACCOUNTING_ENABLED=1</code> on Vercel and{" "}
          <code className="text-xs">NATIVE_ACCOUNTING_ENABLED=1</code> on the backend, then redeploy.
          Commerce checkout and orders are unaffected when flags remain off.
        </div>
        <button type="button" onClick={() => router.push("/admin")} className="text-sm text-[#1e3a2f] underline">
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-1 font-sans">
      <AccountingUatBanner />
      <AdminAccountingNav />
      {children}
    </div>
  );
}
