"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["Overview", "/admin/accounting/banking", true],
  ["Bank & Cash Accounts", "/admin/accounting/banking/accounts", false],
  ["Statements & Matching", "/admin/accounting/banking/statements", false],
  ["Transfers", "/admin/accounting/banking/transfers", false],
  ["Reconciliation", "/admin/accounting/banking/reconciliation", false],
  ["Gateway Clearing", "/admin/accounting/banking/gateway", false]
] as const;

export function AdminBankingNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Banking workspace" className="overflow-x-auto border-b border-[#e0d8ce]">
      <div className="flex min-w-max gap-1">
        {items.map(([label, href, exact]) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                active ? "border-[#1c352a] text-[#1c352a]" : "border-transparent text-[#75675e] hover:text-[#1c352a]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
