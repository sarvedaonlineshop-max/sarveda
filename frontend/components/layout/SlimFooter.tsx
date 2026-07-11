import Link from "next/link";

/** Slim fixed footer for app-style pages (/shop). Sits above the mobile bottom nav. */
export function SlimFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-40 flex items-center justify-center gap-4 border-t border-brand-cream/10 bg-brand-forest px-4 py-1.5 text-[11px] text-brand-cream/80 md:bottom-0 md:py-2">
      <p className="whitespace-nowrap">© {new Date().getFullYear()} Sarveda · All rights reserved</p>
      <Link href="/privacy" className="shrink-0 hover:text-brand-gold">
        Privacy
      </Link>
      <Link href="/terms" className="shrink-0 hover:text-brand-gold">
        Terms
      </Link>
    </footer>
  );
}
