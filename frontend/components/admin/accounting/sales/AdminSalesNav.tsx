"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["Overview", "/admin/accounting/sales", true],
  ["Sales Entries", "/admin/accounting/order-paid", false],
  ["Refunds", "/admin/accounting/order-refunded-full", false],
  ["Gateway Settlements", "/admin/accounting/settlements", false]
] as const;

/** Secondary in-page Sales tabs — quieter than the Accounting sidebar. */
export function AdminSalesNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sales sections"
      className="rounded-lg border border-[#ebe4db] bg-[#faf5ec]/60 px-1.5 py-1"
    >
      <div className="flex min-w-0 flex-wrap gap-0.5">
        {items.map(([label, href, exact]) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
                active
                  ? "bg-white text-[#1c352a] shadow-sm ring-1 ring-[#e0d8ce]"
                  : "text-[#8a7060] hover:bg-white/70 hover:text-[#4a3f38]"
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
