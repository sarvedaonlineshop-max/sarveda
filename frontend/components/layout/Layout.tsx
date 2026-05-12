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
      <main className="bg-stone-50 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        <PageTransition>{children}</PageTransition>
      </main>
      <SiteFooter />
      <BottomNav />
    </MotionConfig>
  );
}
