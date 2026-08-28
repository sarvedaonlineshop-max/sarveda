"use client";

import { AdminBankingNav } from "@/components/admin/accounting/banking/AdminBankingNav";

export default function BankingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <AdminBankingNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
