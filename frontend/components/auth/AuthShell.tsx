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

const LOGIN_BACKGROUND_ASSET = "/assets/auth/sarveda-login-background.png";

function BenefitCard({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="group rounded-2xl border border-[#e7dcc9]/80 bg-white/70 px-5 py-5 text-center shadow-[0_18px_52px_rgba(28,53,42,0.08)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-[#c89435]/55 hover:bg-white/90 hover:shadow-[0_24px_70px_rgba(28,53,42,0.12)]">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-[#c89435]/30 bg-[#fff8e8] text-xl text-[#b98a3e] transition duration-300 group-hover:scale-105">
        {icon}
      </div>
      <p className="text-sm font-semibold leading-snug text-[#10201a]">{title}</p>
    </div>
  );
}

function TrustPill({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#d9c8ab]/90 bg-white/74 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6f2d] shadow-[0_10px_30px_rgba(28,53,42,0.06)] backdrop-blur-md">
      <span className="text-base leading-none">{icon}</span>
      {label}
    </span>
  );
}

function AdminAuthShell({ title, subtitle, children, footer, showMobileLogo }: AuthShellProps) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f7f0e6] px-4 py-8 font-sans text-[#10201a] sm:px-6 lg:min-h-screen lg:py-16">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#d8ebd8]/55 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[32rem] w-[32rem] rounded-full bg-[#d8ebd8]/50 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 -translate-x-1/2 opacity-[0.05]">
          <SarvedaLogoWatermark height={320} tone="onLight" />
        </div>
      </div>
      <div className="relative mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-16">
        <div className="hidden text-left lg:block">
          <SarvedaLogo iconHeight={48} tone="onLight" />
          <p className="mt-8 max-w-xl font-serif text-5xl font-semibold leading-tight tracking-tight">
            Sarveda Admin
          </p>
          <p className="mt-5 max-w-lg text-lg leading-8 text-[#526158]">
            Operations workspace for orders, shipments, returns, inventory, customers, and accounting. Secure staff access only.
          </p>
        </div>
        <div className="rounded-3xl border border-[#e5d8c2] bg-white/92 p-6 shadow-[0_30px_90px_rgba(28,53,42,0.16)] backdrop-blur-xl sm:p-8 lg:p-10">
          {showMobileLogo ? (
            <div className="mb-5 flex justify-center lg:hidden">
              <SarvedaLogo iconHeight={44} tone="onLight" />
            </div>
          ) : null}
          <div className="text-center lg:text-left">
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#10201a]">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm leading-relaxed text-[#526158]">{subtitle}</p> : null}
          </div>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t border-[#eadfcd] pt-6">{footer}</div> : null}
        </div>
      </div>
    </div>
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

  if (adminMode) {
    return <AdminAuthShell title={title} subtitle={subtitle} footer={footer} showMobileLogo={showMobileLogo}>{children}</AdminAuthShell>;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f8f1e7] font-sans text-[#10201a] lg:min-h-screen">
      <div
        className="pointer-events-none absolute inset-0 hidden bg-cover bg-center bg-no-repeat lg:block"
        style={{ backgroundImage: `url(${LOGIN_BACKGROUND_ASSET})` }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 hidden bg-white/[0.03] lg:block" aria-hidden="true" />

      <div className="relative hidden min-h-screen w-full lg:block">
        <div className="absolute right-[7.5%] top-8 z-10 flex items-center gap-6 text-sm font-medium text-[#173229]/85 xl:right-[8.5%]">
          <Link href="/contact" className="inline-flex items-center gap-2 hover:text-[#166D46]">
            <span aria-hidden>◔</span>
            Need help?
          </Link>
          <span className="h-5 w-px bg-[#d7c7ae]" />
          <button type="button" className="inline-flex items-center gap-2 hover:text-[#166D46]">
            English <span aria-hidden>⌄</span>
          </button>
        </div>

        <section className="absolute left-[18%] top-[12%] max-w-[560px] xl:left-[19.5%] 2xl:left-[20.5%]">
          <SarvedaLogo iconHeight={70} tone="onLight" />
          <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.45em] text-[#6f7b67]">
            Yoga · Sound · Wellbeing
          </p>
          <h2 className="mt-10 font-serif text-[4.15rem] font-semibold leading-[0.95] tracking-[-0.058em] text-[#10201a] xl:text-[4.55rem]">
            Welcome to your<br />Sarveda space
          </h2>
          <p className="mt-6 max-w-[610px] text-xl leading-8 text-[#4f5f56]">
            Track your orders, continue your courses, save your favourites, and return to the practices that support your daily wellbeing.
          </p>

          <div className="mt-8 grid max-w-[560px] grid-cols-3 gap-5">
            <BenefitCard icon="□" title="Track orders and returns" />
            <BenefitCard icon="⌂" title="Access courses and events" />
            <BenefitCard icon="♡" title="Save cart and wishlist" />
          </div>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/store"
              className="group inline-flex min-h-[58px] items-center justify-center gap-2 rounded-full bg-[#c28a2b] px-10 text-base font-bold text-[#10201a] shadow-[0_18px_38px_rgba(194,138,43,0.28)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#ad7924] hover:shadow-[0_22px_48px_rgba(194,138,43,0.36)]"
            >
              Shop now <span className="transition duration-300 group-hover:translate-x-1">→</span>
            </Link>
            <Link
              href="/courses"
              className="inline-flex min-h-[58px] items-center justify-center rounded-full border border-[#b98a3e] bg-white/68 px-10 text-base font-bold text-[#9a6f2d] shadow-[0_12px_30px_rgba(28,53,42,0.06)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white/90"
            >
              Explore courses
            </Link>
          </div>

          <div className="mt-9 flex max-w-[620px] flex-wrap gap-3 border-t border-[#e1d1ba]/70 pt-7">
            <TrustPill icon="◎" label="Worldwide shipping" />
            <TrustPill icon="♢" label="Secure checkout" />
            <TrustPill icon="✦" label="169+ products" />
          </div>
        </section>

        <section className="absolute left-[54.2%] top-[10.8%] w-[31.4rem] xl:left-[54.8%] 2xl:left-[55.3%]">
          <div className="rounded-[1.85rem] border border-white/90 bg-white/92 px-9 py-10 shadow-[0_34px_100px_rgba(28,53,42,0.18)] backdrop-blur-xl">
            <div className="text-left">
              <h1 className="font-serif text-[2.45rem] font-semibold leading-tight tracking-[-0.055em] text-[#10201a]">
                {title}
              </h1>
              {subtitle ? <p className="mt-3 text-base leading-relaxed text-[#526158]">{subtitle}</p> : null}
            </div>
            <div className="mt-7">{children}</div>
            {footer ? <div className="mt-8 border-t border-[#eadfcd] pt-6">{footer}</div> : null}
          </div>
        </section>

        <aside className="absolute right-[6.6%] top-[28%] hidden w-[13rem] text-[#536257] xl:block">
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
        </aside>

        <div className="pointer-events-none absolute bottom-[6.6%] left-[5.7%] max-w-[280px] rounded-[2rem] bg-[#10201a]/16 px-7 py-6 font-serif text-2xl italic leading-tight text-white shadow-[0_22px_70px_rgba(28,53,42,0.14)] backdrop-blur-sm">
          “A calmer you,<br />a kinder world.”
          <div className="mt-5 h-0.5 w-14 bg-[#c28a2b]" />
        </div>

        <footer className="absolute bottom-5 left-[4.8%] right-[6.8%] flex items-center justify-between text-xs text-[#526158]">
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

      <div className="relative flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6 lg:hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-[#d8ebd8]/70 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#f4dc9b]/20 blur-3xl" />
          <div className="absolute left-1/2 top-[18%] -translate-x-1/2 opacity-[0.06]">
            <SarvedaLogoWatermark height={260} tone="onLight" />
          </div>
        </div>
        <div className="w-full max-w-[27rem] rounded-[1.6rem] border border-[#e5d8c2] bg-white/94 p-5 shadow-[0_26px_80px_rgba(28,53,42,0.16)] backdrop-blur-xl sm:p-7">
          {showMobileLogo ? (
            <div className={`flex justify-center ${compactMobile ? "mb-4" : "mb-6"}`}>
              <SarvedaLogo iconHeight={compactMobile ? 54 : 44} tone="onLight" />
            </div>
          ) : null}
          <div className="text-center">
            <h1 className="font-serif text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-[#10201a]">
              {title}
            </h1>
            {subtitle ? <p className="mt-2 text-sm leading-relaxed text-[#526158]">{subtitle}</p> : null}
          </div>
          <div className={compactMobile ? "mt-5" : "mt-7"}>{children}</div>
          {footer ? <div className="mt-5 border-t border-[#eadfcd] pt-4">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
