"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";
import { AccountingUatBanner } from "@/components/admin/accounting/AccountingUatBanner";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { isAccountingEnabled } from "@/lib/accounting-api";
import { isAccountingEmailAllowed } from "@/lib/accounting-access";

export default function AdminAccountingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAdminUser();
  const flagOn = isAccountingEnabled();
  const allowed = isAccountingEmailAllowed(user?.email);
  const enabled = flagOn && allowed;
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  if (!checked) return null;

  if (!flagOn) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminAccountingHeader title="Accounting (preview)" />
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Set <code className="text-xs">NEXT_PUBLIC_ACCOUNTING_ENABLED=1</code> on Vercel and{" "}
          <code className="text-xs">NATIVE_ACCOUNTING_ENABLED=1</code> on the backend, then redeploy.
        </div>
        <button type="button" onClick={() => router.push("/admin")} className="text-sm text-[#1e3a2f] underline">
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <AdminAccountingHeader title="Accounting" />
        <div className="rounded-lg border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-800">
          Accounting is limited to designated finance users. Contact a store owner if you need access.
        </div>
        <button type="button" onClick={() => router.push("/admin")} className="text-sm text-[#1e3a2f] underline">
          Back to dashboard
        </button>
      </div>
    );
  }

  if (!enabled) return null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-1 font-sans">
      <AccountingUatBanner />
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}
