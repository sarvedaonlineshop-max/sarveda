"use client";

import { MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";

import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { PageTransition } from "./PageTransition";
import { SiteFooter } from "./SiteFooter";

export function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const chromeless =
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/signup");

  if (chromeless) {
    return <>{children}</>;
  }

  return (
    <MotionConfig reducedMotion="user">
      <Header />
      <main className="pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0" style={{ background:"#fdf6ed" }}>
        <PageTransition>{children}</PageTransition>
      </main>
      <a
        href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919999999999"}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-24 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 md:bottom-6"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden>
          <path d="M20.52 3.48A11.8 11.8 0 0012.06 0C5.5 0 .14 5.35.14 11.9c0 2.1.55 4.15 1.6 5.95L0 24l6.33-1.66a11.87 11.87 0 005.72 1.45h.01c6.56 0 11.92-5.35 11.93-11.9a11.8 11.8 0 00-3.47-8.41zm-8.46 18.3a9.9 9.9 0 01-5.05-1.39l-.36-.21-3.75.98 1-3.65-.24-.38a9.87 9.87 0 01-1.52-5.23c0-5.47 4.45-9.92 9.93-9.92 2.65 0 5.14 1.03 7.01 2.9a9.86 9.86 0 012.9 7.02c0 5.47-4.46 9.92-9.92 9.92zm5.44-7.4c-.3-.15-1.79-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.96 1.18-.17.2-.35.23-.65.08-.3-.15-1.26-.46-2.4-1.46a9.07 9.07 0 01-1.67-2.08c-.18-.3-.02-.47.13-.62.13-.13.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.64-.93-2.24-.25-.6-.5-.52-.68-.53l-.58-.01c-.2 0-.53.08-.8.38-.28.3-1.06 1.03-1.06 2.5 0 1.48 1.09 2.9 1.24 3.1.15.2 2.13 3.25 5.16 4.56.72.31 1.29.5 1.73.64.73.23 1.39.2 1.91.12.58-.09 1.79-.73 2.04-1.43.25-.7.25-1.3.18-1.43-.08-.13-.28-.2-.58-.35z" />
        </svg>
      </a>
      <SiteFooter />
      <BottomNav />
    </MotionConfig>
  );
}
