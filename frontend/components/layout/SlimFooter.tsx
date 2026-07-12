import Link from "next/link";

import { MOBILE_MENU_POLICY_LINKS } from "@/lib/policy-links";

/** Fixed slim footer for all non-home storefront pages — desktop only; mobile uses BottomNav menu. */
export function SlimFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 hidden flex-wrap items-center justify-center gap-x-4 border-t border-brand-cream/10 bg-brand-forest px-3 py-2.5 text-[11px] text-brand-cream/80 md:flex">
      <p className="whitespace-nowrap">© {new Date().getFullYear()} Sarveda · All rights reserved</p>
      <nav className="flex flex-wrap items-center justify-center gap-x-4" aria-label="Shop policies">
        {MOBILE_MENU_POLICY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="shrink-0 font-medium text-brand-gold-pale transition-colors hover:text-brand-gold"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
