import Link from "next/link";
import type { ReactNode } from "react";

import { SarvedaLogo, SarvedaLogoWatermark } from "@/components/brand/SarvedaLogo";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Login page uses light mode per product spec. */
  variant?: "light" | "dark";
  /** Show Sarveda logo above the title on small screens (login). */
  showMobileLogo?: boolean;
  /** Tighter mobile layout — fit login on one screen without scroll. */
  compactMobile?: boolean;
  /** When this is an admin sign-in request, avoid storefront/customer marketing copy. */
  adminMode?: boolean;
};

function BenefitCard({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="group rounded-2xl border border-[#e7dcc9]/80 bg-white/58 px-5 py-5 text-center shadow-[0_18px_50px_rgba(28,53,42,0.06)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-[#c89435]/45 hover:bg-white/75 hover:shadow-[0_22px_60px_rgba(28,53,42,0.10)]">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#c89435]/25 bg-[#fff8e8] text-xl text-[#b98a3e] transition duration-300 group-hover:scale-105">
        {icon}
      </div>
      <p className="text-sm font-semibold leading-snug text-[#10201a]">{title}</p>
    </div>
  );
}

function TrustPill({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#d9c8ab]/80 bg-white/64 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6f2d] shadow-[0_10px_30px_rgba(28,53,42,0.05)] backdrop-blur-md">
      <span className="text-base leading-none">{icon}</span>
      {label}
    </span>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  variant = "dark",
  showMobileLogo = false,
  compactMobile = false,
  adminMode = false
}: AuthShellProps) {
  const isLight = variant === "light";

  if (!isLight) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-stone-900 via-stone-950 to-black px-4 py-12 font-sans sm:px-6 lg:py-16">
        <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
          <SarvedaLogoWatermark className="opacity-[0.08]" height={240} tone="onDark" />
        </div>
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-16">
          <div className="hidden text-center lg:block lg:text-left">
            <SarvedaLogo iconHeight={40} tone="onDark" />
            <p className="mt-4 max-w-md font-serif text-3xl font-semibold leading-tight text-stone-100">
              Secure Sarveda access.
            </p>
            <p className="mt-4 max-w-md text-base leading-relaxed text-stone-400">
              Sign in to continue managing your account.
            </p>
          </div>
          <div className="rounded-3xl border border-stone-700/80 bg-stone-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-10">
            {showMobileLogo ? (
              <div className="mb-5 flex justify-center lg:hidden">
                <SarvedaLogo iconHeight={44} tone="onDark" />
              </div>
            ) : null}
            <div className="text-center lg:text-left">
              <h1 className="font-serif text-[1.85rem] font-bold tracking-tight text-amber-400 sm:text-3xl">
                {title}
              </h1>
              {subtitle ? <p className="mt-2 text-sm leading-relaxed text-stone-400">{subtitle}</p> : null}
            </div>
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-8 border-t border-stone-800 pt-6">{footer}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  const leftTitle = adminMode ? "Sarveda Admin" : "Welcome to your Sarveda space";
  const leftBody = adminMode
    ? "Operations workspace for orders, shipments, returns, inventory, customers, and accounting. Secure staff access only."
    : "Track your orders, continue your courses, save your favourites, and return to the practices that support your daily wellbeing.";

  return (
    <div className="relative flex min-h-dvh overflow-hidden bg-[#f7f0e6] font-sans text-[#10201a] lg:min-h-screen">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#d8ebd8]/55 blur-3xl" />
        <div className="absolute left-[38%] top-16 h-[34rem] w-[34rem] rounded-full bg-[#f4dc9b]/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[32rem] w-[32rem] rounded-full bg-[#d8ebd8]/50 blur-3xl" />
        <div className="absolute left-[32%] top-[17%] opacity-[0.045]">
          <SarvedaLogoWatermark height={300} tone="onLight" />
        </div>
        <div className="absolute -left-8 top-0 hidden h-[34rem] w-[24rem] rounded-br-[46%] bg-[radial-gradient(circle_at_10%_20%,rgba(255,211,92,0.38),transparent_24%),linear-gradient(160deg,rgba(29,84,54,0.28),rgba(255,255,255,0)_68%)] lg:block" />
        <div className="absolute bottom-0 left-0 hidden h-[26rem] w-[38rem] bg-[radial-gradient(ellipse_at_18%_92%,rgba(29,84,54,0.35),transparent_58%)] lg:block" />
        <div className="absolute -bottom-14 right-6 hidden h-80 w-80 rounded-full border border-[#d7b56c]/30 opacity-70 lg:block" />
        <div className="absolute bottom-4 right-10 hidden h-72 w-72 rounded-full border border-[#d7b56c]/20 opacity-70 lg:block" />
        <div className="absolute right-[7%] top-[18%] hidden h-24 w-12 rotate-45 rounded-[100%_0_100%_0] bg-[#5d8a63]/25 lg:block" />
        <div className="absolute right-[9%] top-[31%] hidden h-14 w-7 rotate-45 rounded-[100%_0_100%_0] bg-[#5d8a63]/18 lg:block" />
        <div className="absolute right-[19%] bottom-[9%] hidden h-12 w-6 rotate-45 rounded-[100%_0_100%_0] bg-[#5d8a63]/20 lg:block" />
      </div>

      <div className="absolute right-8 top-7 z-10 hidden items-center gap-6 text-sm font-medium text-[#173229]/80 lg:flex">
        <Link href="/contact" className="inline-flex items-center gap-2 hover:text-[#166D46]">
          <span aria-hidden>◔</span>
          Need help?
        </Link>
        <span className="h-5 w-px bg-[#d7c7ae]" />
        <button type="button" className="inline-flex items-center gap-2 hover:text-[#166D46]">
          English <span aria-hidden>⌄</span>
        </button>
      </div>

      <div className="relative mx-auto grid w-full max-w-[1460px] grid-cols-1 items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,31rem)_minmax(8rem,12rem)] lg:px-12 lg:py-10 xl:gap-12">
        <section className="hidden min-h-[760px] flex-col justify-center lg:flex">
          <div className="max-w-[640px]">
            <SarvedaLogo iconHeight={58} tone="onLight" />
            <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.42em] text-[#6f7b67]">
              Yoga · Sound · Wellbeing
            </p>

            <h2 className="mt-12 max-w-[560px] font-serif text-[4.15rem] font-semibold leading-[0.95] tracking-[-0.055em] text-[#10201a]">
              {leftTitle}
            </h2>
            <p className="mt-7 max-w-[600px] text-xl leading-8 text-[#526158]">
              {leftBody}
            </p>

            {adminMode ? (
              <div className="mt-8 rounded-2xl border border-[#d8c8ac]/80 bg-white/58 p-5 text-sm leading-6 text-[#526158] shadow-[0_18px_50px_rgba(28,53,42,0.06)] backdrop-blur-md">
                Orders · Shipments · Returns · Inventory · Customers · Accounting
              </div>
            ) : (
              <>
                <div className="mt-9 grid max-w-[560px] grid-cols-3 gap-5">
                  <BenefitCard icon="□" title="Track orders and returns" />
                  <BenefitCard icon="⌂" title="Access courses and events" />
                  <BenefitCard icon="♡" title="Save cart and wishlist" />
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  <Link
                    href="/store"
                    className="group inline-flex min-h-[58px] items-center justify-center gap-2 rounded-full bg-[#c28a2b] px-9 text-base font-bold text-[#10201a] shadow-[0_18px_38px_rgba(194,138,43,0.25)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#ad7924] hover:shadow-[0_22px_48px_rgba(194,138,43,0.32)]"
                  >
                    Shop now <span className="transition duration-300 group-hover:translate-x-1">→</span>
                  </Link>
                  <Link
                    href="/courses"
                    className="inline-flex min-h-[58px] items-center justify-center rounded-full border border-[#b98a3e] bg-white/54 px-9 text-base font-bold text-[#9a6f2d] shadow-[0_12px_30px_rgba(28,53,42,0.05)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white/75"
                  >
                    Explore courses
                  </Link>
                </div>

                <div className="mt-10 flex flex-wrap gap-3 border-t border-[#e1d1ba]/70 pt-7">
                  <TrustPill icon="◎" label="Worldwide shipping" />
                  <TrustPill icon="♢" label="Secure checkout" />
                  <TrustPill icon="✦" label="169+ products" />
                </div>

                <div className="mt-16 max-w-xs rounded-3xl bg-[#10201a]/10 px-7 py-6 font-serif text-2xl italic leading-tight text-white shadow-[0_20px_70px_rgba(28,53,42,0.10)] backdrop-blur-sm">
                  “A calmer you,<br />a kinder world.”
                  <div className="mt-5 h-0.5 w-14 bg-[#c28a2b]" />
                </div>
              </>
            )}
          </div>
        </section>

        <section className="flex min-h-dvh items-center justify-center py-5 lg:min-h-[760px] lg:py-0">
          <div className="w-full max-w-[31rem] animate-[authCardIn_520ms_cubic-bezier(0.22,1,0.36,1)_both] rounded-[1.65rem] border border-white/70 bg-white/86 p-6 shadow-[0_30px_90px_rgba(28,53,42,0.18)] backdrop-blur-xl sm:p-8 lg:p-10">
            {showMobileLogo ? (
              <div className={`flex justify-center lg:hidden ${compactMobile ? "mb-4" : "mb-6"}`}>
                <SarvedaLogo iconHeight={compactMobile ? 58 : 46} tone="onLight" />
              </div>
            ) : null}
            <div className="text-center lg:text-left">
              <h1 className="font-serif text-[2.15rem] font-semibold leading-tight tracking-[-0.045em] text-[#10201a] sm:text-[2.35rem]">
                {title}
              </h1>
              {subtitle ? <p className="mt-3 text-base leading-relaxed text-[#526158]">{subtitle}</p> : null}
            </div>
            <div className={compactMobile ? "mt-5 sm:mt-7" : "mt-8"}>{children}</div>
            {footer ? (
              <div className={`${compactMobile ? "mt-5 border-t pt-4 sm:mt-7 sm:pt-6" : "mt-8 border-t pt-6"} border-[#eadfcd]`}>
                {footer}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="hidden min-h-[760px] flex-col justify-center text-[#536257] lg:flex">
          {!adminMode ? (
            <div className="space-y-8">
              <div className="space-y-4 text-xs font-semibold uppercase tracking-[0.42em]">
                <p>Practice</p>
                <p>Breathe</p>
                <p>Heal</p>
                <p>Belong</p>
              </div>
              <div className="h-0.5 w-12 bg-[#c28a2b]" />
              <p className="font-serif text-2xl italic leading-tight text-[#526158]">
                More<br />than a store.<br />A way of life.
              </p>
            </div>
          ) : null}
        </aside>
      </div>

      <footer className="absolute bottom-5 left-6 right-6 hidden items-center justify-between text-xs text-[#526158] lg:flex">
        <p>© 2026 Sarveda. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/privacy-policy" className="hover:text-[#166D46]">Privacy Policy</Link>
          <span className="text-[#cdbda2]">|</span>
          <Link href="/terms" className="hover:text-[#166D46]">Terms of Service</Link>
          <span className="text-[#cdbda2]">|</span>
          <Link href="/contact" className="hover:text-[#166D46]">Contact Us</Link>
        </div>
      </footer>
    </div>
  );
}
