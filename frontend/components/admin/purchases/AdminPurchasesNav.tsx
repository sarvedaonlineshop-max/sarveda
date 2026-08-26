"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/purchases/vendors", label: "Vendors" },
  { href: "/admin/purchases/purchase-orders", label: "Purchase Orders" },
  { href: "/admin/purchases/bills", label: "Bills" },
  { href: "/admin/purchases/expenses", label: "Expenses" }
];

export function AdminPurchasesNav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3 dark:border-stone-700">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-[#1e3a2f] text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export function AdminPurchasesHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
        borderRadius: "16px",
        padding: "20px 24px"
      }}
    >
      <h1 className="text-2xl font-bold text-[#faf5ec]">{title}</h1>
      {subtitle ? <p className="mt-1 text-xs text-[#a8c4b0]">{subtitle}</p> : null}
    </div>
  );
}
