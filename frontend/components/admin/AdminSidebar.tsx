"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutSession } from "@/lib/auth-client";

const nav = [
  { href: "/admin", label: "Dashboard", icon: "◆" },
  { href: "/admin/orders", label: "Orders", icon: "◇" },
  { href: "/admin/reconciliation", label: "Reconciliation", icon: "₹" },
  { href: "/admin/products", label: "Products", icon: "○" },
  { href: "/admin/catalog-gaps", label: "Catalog gaps", icon: "!" },
  { href: "/admin/inventory", label: "Inventory", icon: "▫" },
  { href: "/admin/settings/pickup-locations", label: "Warehouses", icon: "⌂" }
];

export function AdminSidebar({
  onNavigate,
  preferDarkMain,
  onToggleMainTheme
}: {
  onNavigate?: () => void;
  preferDarkMain: boolean;
  onToggleMainTheme: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col border-r border-stone-800 bg-stone-900">
      <div className="border-b border-stone-800 px-5 py-6">
        <Link
          href="/admin"
          className="block font-serif text-xl italic text-amber-400"
          onClick={onNavigate}
        >
          Sarveda Admin
        </Link>
        <p className="mt-1 text-xs text-stone-500">Store operations</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Admin">
        {nav.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium tracking-wide transition-colors ${
                active
                  ? "bg-stone-800 text-amber-400"
                  : "text-stone-300 hover:bg-stone-800/80 hover:text-amber-400"
              }`}
            >
              <span className="w-5 text-center text-amber-500/80" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-stone-800 p-3">
        <button
          type="button"
          onClick={onToggleMainTheme}
          className="mb-2 w-full rounded-lg border border-stone-700 bg-stone-800/80 px-3 py-2 text-left text-sm text-stone-300 hover:border-amber-500/40 hover:text-amber-400"
        >
          {preferDarkMain ? "Workspace: dark" : "Workspace: light"} — tap to toggle
        </button>
        <Link
          href="/shop"
          onClick={onNavigate}
          className="block rounded-lg px-3 py-2 text-sm text-stone-400 hover:bg-stone-800 hover:text-amber-400"
        >
          ← Storefront
        </Link>
        <button
          type="button"
          className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-stone-500 hover:bg-stone-800 hover:text-amber-500"
          onClick={async () => {
            await logoutSession();
            window.location.href = "/";
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
