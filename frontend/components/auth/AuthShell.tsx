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

const ICON_GOLD = "#b98a3e";

function IconPackage() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 8.5V16.2a2 2 0 0 1-1.1 1.8l-6.4 3.2a2 2 0 0 1-1.8 0l-6.4-3.2A2 2 0 0 1 4 16.2V8.5a2 2 0 0 1 1.1-1.8l6.4-3.2a2 2 0 0 1 1.8 0l6.4 3.2A2 2 0 0 1 21 8.5Z"
        stroke={ICON_GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 22V12" stroke={ICON_GOLD} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.6 7.2 12 12l8.4-4.8" stroke={ICON_GOLD} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.2 5.2 7.8 9.4" stroke={ICON_GOLD} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconGraduation() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2.5 9.2 12 4.5l9.5 4.7L12 13.9 2.5 9.2Z"
        stroke={ICON_GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 11.4v4.1c0 .7 2.5 2.5 5.5 2.5s5.5-1.8 5.5-2.5v-4.1"
        stroke={ICON_GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M21.5 9.4v5.2" stroke={ICON_GOLD} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20.2s-6.8-4.2-8.8-8.1C1.7 9 2.8 6.2 5.5 5.4c1.7-.5 3.4.2 4.4 1.5C10.9 5.6 12.6 4.9 14.3 5.4c2.7.8 3.8 3.6 2.3 6.7-2 3.9-8.6 8.1-8.6 8.1Z"
        stroke={ICON_GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 5 6.2v5.3c0 4.4 2.9 7.5 7 8.8 4.1-1.3 7-4.4 7-8.8V6.2L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BenefitCard({ icon, title }: { icon: ReactNode; title: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e7dcc9]/90 bg-white/80 px-4 py-5 text-center shadow-[0_14px_40px_rgba(28,53,42,0.07)] backdrop-blur-md">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center">{icon}</div>
      <div className="text-[13px] font-semibold leading-snug text-[#10201a]">{title}</div>
    </div>
  );
}

function TrustPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[#d9c8ab]/90 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a6f2d] shadow-[0_10px_30px_rgba(28,53,42,0.06)] backdrop-blur-md">
      <span className="text-[#b98a3e]">{icon}</span>
      {label}
    </span>
  );
}

function SocialDot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <a
      href="#"
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#2c3a33] text-white transition hover:bg-[#166D46]"
    >
      {children}
    </a>
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
            Operations workspace for orders, shipments, returns, inventory, customers, and accounting. Secure staff
            access only.
          </p>
        </div>
        <div className="rounded-3xl border border-[#e5d8c2] bg-white p-6 shadow-[0_30px_90px_rgba(28,53,42,0.16)] sm:p-8 lg:p-10">
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
    return (
      <AdminAuthShell title={title} subtitle={subtitle} footer={footer} showMobileLogo={showMobileLogo}>
        {children}
      </AdminAuthShell>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#f8f1e7] font-sans text-[#10201a] lg:min-h-screen">
      <div
        className="pointer-events-none absolute inset-0 hidden bg-cover bg-center bg-no-repeat lg:block"
        style={{ backgroundImage: `url(${LOGIN_BACKGROUND_ASSET})` }}
        aria-hidden="true"
      />

      {/* Desktop landing */}
      <div className="relative hidden min-h-screen w-full pb-[72px] lg:block">
        <section className="absolute left-[7.5%] top-[7.5%] max-w-[560px] xl:left-[8.5%] 2xl:left-[9.5%]">
          <SarvedaLogo iconHeight={104} tone="onLight" />
          <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.45em] text-[#6f7b67]">
            Yoga · Sound · Wellbeing
          </p>
          <h2 className="mt-9 font-serif text-[3.9rem] font-semibold leading-[0.95] tracking-[-0.058em] text-[#10201a] xl:text-[4.35rem]">
            Welcome to your
            <br />
            Sarveda space
          </h2>
          <p className="mt-5 max-w-[540px] text-lg leading-8 text-[#4f5f56] xl:text-xl">
            Track your orders, continue your courses, save your favourites, and return to the practices that support
            your daily wellbeing.
          </p>

          <div className="mt-7 grid max-w-[520px] grid-cols-3 gap-4">
            <BenefitCard
              icon={<IconPackage />}
              title={
                <>
                  Track orders
                  <br />
                  and returns
                </>
              }
            />
            <BenefitCard
              icon={<IconGraduation />}
              title={
                <>
                  Access courses
                  <br />
                  and events
                </>
              }
            />
            <BenefitCard
              icon={<IconHeart />}
              title={
                <>
                  Save cart
                  <br />
                  and wishlist
                </>
              }
            />
          </div>

          <div className="mt-7 flex flex-wrap gap-4">
            <Link
              href="/store"
              className="group inline-flex min-h-[54px] items-center justify-center gap-2 rounded-full bg-[#c28a2b] px-9 text-base font-bold text-white shadow-[0_18px_38px_rgba(194,138,43,0.28)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#ad7924]"
            >
              Shop now <span className="transition duration-300 group-hover:translate-x-1">→</span>
            </Link>
            <Link
              href="/courses"
              className="inline-flex min-h-[54px] items-center justify-center rounded-full border border-[#b98a3e] bg-white/75 px-9 text-base font-bold text-[#9a6f2d] shadow-[0_12px_30px_rgba(28,53,42,0.06)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white"
            >
              Explore courses
            </Link>
          </div>

          <div className="mt-8 flex max-w-[520px] flex-wrap gap-3 border-t border-[#e1d1ba]/70 pt-6">
            <TrustPill icon={<IconGlobe />} label="Worldwide shipping" />
            <TrustPill icon={<IconShield />} label="Secure checkout" />
          </div>
        </section>

        {/* Login card — aligned to sample right margin */}
        <section className="absolute right-[15.5%] top-[8.5%] w-[30.5rem] xl:right-[16%] 2xl:right-[16.5%]">
          <div className="min-h-[38.5rem] rounded-[1.75rem] border border-[#ece4d7] bg-white px-9 py-10 shadow-[0_34px_100px_rgba(28,53,42,0.16)]">
            <div className="text-left">
              <h1 className="font-serif text-[2.35rem] font-semibold leading-tight tracking-[-0.05em] text-[#10201a]">
                {title}
              </h1>
              {subtitle ? <p className="mt-3 text-base leading-relaxed text-[#526158]">{subtitle}</p> : null}
            </div>
            <div className="mt-7">{children}</div>
            {footer ? <div className="mt-8 border-t border-[#eadfcd] pt-6">{footer}</div> : null}
          </div>
        </section>

        {/* Tagline to the right of the form */}
        <aside className="absolute right-[5.5%] top-[34%] hidden w-[11.5rem] xl:block 2xl:right-[6%]">
          <div className="h-0.5 w-12 bg-[#c28a2b]" />
          <p className="mt-5 font-serif text-[1.65rem] italic leading-tight text-[#3f4f46]">
            More
            <br />
            than a store.
            <br />
            A way of life.
          </p>
        </aside>

        <div className="pointer-events-none absolute bottom-[7.5rem] left-[5.5%] max-w-[280px] rounded-[2rem] bg-[#10201a]/18 px-7 py-6 font-serif text-2xl italic leading-tight text-white shadow-[0_22px_70px_rgba(28,53,42,0.14)] backdrop-blur-sm">
          “A calmer you,
          <br />
          a kinder world.”
          <div className="mt-5 h-0.5 w-14 bg-[#c28a2b]" />
        </div>

        {/* Solid footer bar — always visible */}
        <footer className="absolute bottom-0 left-0 right-0 z-20 flex h-[64px] items-center justify-between border-t border-[#eadfcd] bg-white px-[4.5%] text-sm text-[#526158]">
          <p>© 2026 Sarveda. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-[#166D46]">
              Privacy Policy
            </Link>
            <span className="text-[#cdbda2]">|</span>
            <Link href="/terms" className="hover:text-[#166D46]">
              Terms of Service
            </Link>
            <span className="text-[#cdbda2]">|</span>
            <Link href="/contact" className="hover:text-[#166D46]">
              Contact Us
            </Link>
            <div className="ml-2 flex items-center gap-2">
              <SocialDot label="Instagram">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 5.2A3.8 3.8 0 1 0 15.8 12 3.8 3.8 0 0 0 12 8.2Zm6.1-.9a.9.9 0 1 0 .9.9.9.9 0 0 0-.9-.9Z" />
                </svg>
              </SocialDot>
              <SocialDot label="YouTube">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M22 8.2a3 3 0 0 0-2.1-2.1C18.2 5.6 12 5.6 12 5.6s-6.2 0-7.9.5A3 3 0 0 0 2 8.2 31.4 31.4 0 0 0 1.5 12a31.4 31.4 0 0 0 .5 3.8 3 3 0 0 0 2.1 2.1c1.7.5 7.9.5 7.9.5s6.2 0 7.9-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 22.5 12a31.4 31.4 0 0 0-.5-3.8ZM10 15.2V8.8L15.5 12Z" />
                </svg>
              </SocialDot>
              <SocialDot label="Facebook">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13v-2c0-.6.4-1 1-1Z" />
                </svg>
              </SocialDot>
              <SocialDot label="Pinterest">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 3a9 9 0 0 0-3.3 17.4c-.1-.8-.2-2 .1-2.9l1.3-5.4s-.3-.7-.3-1.6c0-1.5.9-2.7 2-2.7.9 0 1.4.7 1.4 1.5 0 .9-.6 2.3-.9 3.5-.3 1.1.5 1.9 1.6 1.9 1.9 0 3.2-2.4 3.2-5.3 0-2.2-1.5-3.8-4.2-3.8a4.5 4.5 0 0 0-4.7 4.5c0 .9.3 1.5.7 2l.2.2-.2.9c-.1.3-.3.4-.6.3-1.7-.7-2.5-2.6-2.5-4.7A6.1 6.1 0 0 1 12.8 5C16 5 18 7.2 18 10.2c0 3.7-2.1 6.5-5.1 6.5-1 0-2-.6-2.3-1.2l-.6 2.4c-.2.8-.8 1.8-1.2 2.4A9 9 0 1 0 12 3Z" />
                </svg>
              </SocialDot>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile */}
      <div className="relative flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6 lg:hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-[#d8ebd8]/70 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#f4dc9b]/20 blur-3xl" />
          <div className="absolute left-1/2 top-[18%] -translate-x-1/2 opacity-[0.06]">
            <SarvedaLogoWatermark height={260} tone="onLight" />
          </div>
        </div>
        <div className="w-full max-w-[27rem] rounded-[1.6rem] border border-[#e5d8c2] bg-white p-5 shadow-[0_26px_80px_rgba(28,53,42,0.16)] sm:p-7">
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
