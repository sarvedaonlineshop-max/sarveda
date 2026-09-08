import Link from "next/link";
import type { ReactNode } from "react";

import { SarvedaLogo, SarvedaLogoWatermark } from "@/components/brand/SarvedaLogo";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "light" | "dark";
  showMobileLogo?: boolean;
  compactMobile?: boolean;
  adminMode?: boolean;
};

function BenefitCard({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="group rounded-2xl border border-[#e7dcc9]/85 bg-white/72 px-5 py-5 text-center shadow-[0_18px_52px_rgba(28,53,42,0.08)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-[#c89435]/55 hover:bg-white/90 hover:shadow-[0_24px_70px_rgba(28,53,42,0.12)]">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-[#c89435]/30 bg-[#fff8e8] text-xl text-[#b98a3e] transition duration-300 group-hover:scale-105">
        {icon}
      </div>
      <p className="text-sm font-semibold leading-snug text-[#10201a]">{title}</p>
    </div>
  );
}

function TrustPill({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#d9c8ab]/90 bg-white/76 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6f2d] shadow-[0_10px_30px_rgba(28,53,42,0.06)] backdrop-blur-md">
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
    <div className="relative flex min-h-dvh overflow-hidden bg-[#f9f4eb] font-sans text-[#10201a] lg:min-h-screen">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-32 -top-28 h-[34rem] w-[34rem] rounded-full bg-[#d8ead6]/70 blur-3xl" />
        <div className="absolute left-[30%] top-[7%] h-[38rem] w-[38rem] rounded-full bg-[#f4dc9b]/22 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[38rem] w-[38rem] rounded-full bg-[#dcecdc]/70 blur-3xl" />
        <div className="absolute left-[34%] top-[19%] opacity-[0.055]">
          <SarvedaLogoWatermark height={350} tone="onLight" />
        </div>
        <img
          src="/assets/auth/sarveda-login-nature.svg"
          alt=""
          className="absolute bottom-0 left-0 hidden h-[56vh] min-h-[430px] w-[48vw] max-w-[760px] object-cover object-left-bottom opacity-95 lg:block"
        />
        <div className="absolute left-0 top-0 hidden h-full w-[26vw] bg-gradient-to-r from-[#dbe9d5]/70 via-[#ecf3e8]/35 to-transparent lg:block" />
        <div className="absolute -bottom-16 right-0 hidden h-[23rem] w-[23rem] rounded-full border border-[#d7b56c]/28 opacity-70 lg:block" />
        <div className="absolute bottom-6 right-8 hidden h-[19rem] w-[19rem] rounded-full border border-[#d7b56c]/18 opacity-70 lg:block" />
        <div className="absolute right-[7%] top-[20%] hidden h-24 w-12 rotate-45 rounded-[100%_0_100%_0] bg-[#5d8a63]/25 lg:block" />
        <div className="absolute right-[10%] top-[32%] hidden h-14 w-7 rotate-45 rounded-[100%_0_100%_0] bg-[#5d8a63]/18 lg:block" />
        <div className="absolute right-[18%] bottom-[10%] hidden h-12 w-6 rotate-45 rounded-[100%_0_100%_0] bg-[#5d8a63]/20 lg:block" />
      </div>

      <div className="absolute right-9 top-8 z-10 hidden items-center gap-6 text-sm font-medium text-[#173229]/80 lg:flex">
        <Link href="/contact" className="inline-flex items-center gap-2 hover:text-[#166D46]">
          <span aria-hidden>◔</span>
          Need help?
        </Link>
        <span className="h-5 w-px bg-[#d7c7ae]" />
        <button type="button" className="inline-flex items-center gap-2 hover:text-[#166D46]">
          English <span aria-hidden>⌄</span>
        </button>
      </div>

      <div className="relative mx-auto grid w-full max-w-[1540px] grid-cols-1 items-center gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(25rem,32rem)_minmax(8rem,12rem)] lg:px-16 lg:py-10 xl:gap-14">
        <section className="hidden min-h-[780px] flex-col justify-center lg:flex">
          <div className="max-w-[650px] pb-10">
            <SarvedaLogo iconHeight={76} tone="onLight" />
            <p className="mt-4 text-[0.74rem] font-semibold uppercase tracking-[0.48em] text-[#6f7b67]">
              Yoga · Sound · Wellbeing
            </p>

            <h2 className="mt-12 max-w-[610px] font-serif text-[4.55rem] font-semibold leading-[0.93] tracking-[-0.06em] text-[#10201a]">
              {leftTitle}
            </h2>
            <p className="mt-7 max-w-[640px] text-xl leading-8 text-[#4f5f56]">
              {leftBody}
            </p>

            {adminMode ? (
              <div className="mt-8 rounded-2xl border border-[#d8c8ac]/80 bg-white/70 p-5 text-sm leading-6 text-[#526158] shadow-[0_18px_50px_rgba(28,53,42,0.06)] backdrop-blur-md">
                Orders · Shipments · Returns · Inventory · Customers · Accounting
              </div>
            ) : (
              <>
                <div className="mt-9 grid max-w-[590px] grid-cols-3 gap-5">
                  <BenefitCard icon="□" title="Track orders and returns" />
                  <BenefitCard icon="⌂" title="Access courses and events" />
                  <BenefitCard icon="♡" title="Save cart and wishlist" />
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  <Link
                    href="/store"
                    className="group inline-flex min-h-[60px] items-center justify-center gap-2 rounded-full bg-[#c28a2b] px-10 text-base font-bold text-[#10201a] shadow-[0_18px_38px_rgba(194,138,43,0.28)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#ad7924] hover:shadow-[0_22px_48px_rgba(194,138,43,0.36)]"
                  >
                    Shop now <span className="transition duration-300 group-hover:translate-x-1">→</span>
                  </Link>
                  <Link
                    href="/courses"
                    className="inline-flex min-h-[60px] items-center justify-center rounded-full border border-[#b98a3e] bg-white/68 px-10 text-base font-bold text-[#9a6f2d] shadow-[0_12px_30px_rgba(28,53,42,0.06)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white/90"
                  >
                    Explore courses
                  </Link>
                </div>

                <div className="mt-9 flex max-w-[620px] flex-wrap gap-3 border-t border-[#e1d1ba]/70 pt-7">
                  <TrustPill icon="◎" label="Worldwide shipping" />
                  <TrustPill icon="♢" label="Secure checkout" />
                  <TrustPill icon="✦" label="169+ products" />
                </div>
              </>
            )}
          </div>
        </section>

        <section className="flex min-h-dvh items-center justify-center py-5 lg:min-h-[780px] lg:py-0">
          <div className="w-full max-w-[32rem] rounded-[1.85rem] border border-white/80 bg-white/92 p-6 shadow-[0_34px_100px_rgba(28,53,42,0.20)] backdrop-blur-xl transition duration-500 sm:p-8 lg:p-10">
            {showMobileLogo ? (
              <div className={`flex justify-center lg:hidden ${compactMobile ? "mb-4" : "mb-6"}`}>
                <SarvedaLogo iconHeight={compactMobile ? 58 : 46} tone="onLight" />
              </div>
            ) : null}
            <div className="text-center lg:text-left">
              <h1 className="font-serif text-[2.2rem] font-semibold leading-tight tracking-[-0.045em] text-[#10201a] sm:text-[2.45rem]">
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

        <aside className="hidden min-h-[780px] flex-col justify-center text-[#536257] lg:flex">
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

      {!adminMode ? (
        <div className="pointer-events-none absolute bottom-8 left-20 hidden max-w-[280px] rounded-[2rem] bg-[#10201a]/16 px-7 py-6 font-serif text-2xl italic leading-tight text-white shadow-[0_22px_70px_rgba(28,53,42,0.14)] backdrop-blur-sm lg:block">
          “A calmer you,<br />a kinder world.”
          <div className="mt-5 h-0.5 w-14 bg-[#c28a2b]" />
        </div>
      ) : null}

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
