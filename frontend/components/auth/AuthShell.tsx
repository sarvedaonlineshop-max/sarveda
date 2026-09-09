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
const TRUST_INK = "#1c352a";

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

/** Shopping bag — for Discover / shop instruments. */
function IconBag() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6.5 9h11l-.7 10.2a1.5 1.5 0 0 1-1.5 1.4H8.7a1.5 1.5 0 0 1-1.5-1.4L6.5 9Z"
        stroke={ICON_GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 9V7.2A3 3 0 0 1 12 4.2 3 3 0 0 1 15 7.2V9"
        stroke={ICON_GOLD}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Person / profile — for repeated customers. */
function IconPerson() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.4" stroke={TRUST_INK} strokeWidth="1.55" />
      <path
        d="M5.5 19.2c.8-3.2 3.2-5 6.5-5s5.7 1.8 6.5 5"
        stroke={TRUST_INK}
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={TRUST_INK} strokeWidth="1.55" />
      <path d="M3 12h18" stroke={TRUST_INK} strokeWidth="1.55" />
      <path
        d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z"
        stroke={TRUST_INK}
        strokeWidth="1.55"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 5 6.2v5.3c0 4.4 2.9 7.5 7 8.8 4.1-1.3 7-4.4 7-8.8V6.2L12 3.5Z"
        stroke={TRUST_INK}
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        stroke={TRUST_INK}
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BenefitCard({ icon, title }: { icon: ReactNode; title: ReactNode }) {
  return (
    <div className="group rounded-xl border border-[#e7dcc9]/90 bg-white/85 px-3.5 py-4 text-center shadow-[0_10px_28px_rgba(28,53,42,0.07)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-[#c89435]/70 hover:bg-white hover:shadow-[0_18px_44px_rgba(28,53,42,0.14)]">
      <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center transition duration-300 group-hover:scale-105">
        {icon}
      </div>
      <div className="text-[13px] font-semibold leading-snug text-[#10201a]">{title}</div>
    </div>
  );
}

/** Trust row: dark forest ink for contrast on the photo. */
function TrustStat({ icon, line1, line2 }: { icon: ReactNode; line1: string; line2: string }) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <span className="shrink-0">{icon}</span>
      <span className="text-[13px] font-semibold leading-tight text-[#1c352a]">
        {line1}
        <br />
        {line2}
      </span>
    </div>
  );
}

/** Same profiles as SiteFooter / live store. */
const LOGIN_SOCIAL = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/sarveda_life/",
    d: "M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zM12 7a5 5 0 110 10A5 5 0 0112 7zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm5.25-.75a.875.875 0 110 1.75.875.875 0 010-1.75z"
  },
  {
    label: "Facebook",
    href: "https://www.facebook.com/sarvedalife",
    d: "M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z"
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@sarvedalife",
    d: "M21.8 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2.1-.9C16.1 5 12 5 12 5s-4.1 0-6.9.1c-.4 0-1.3.1-2.1.9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.3.9C6.8 19 12 19 12 19s4.1 0 6.9-.2c.4 0 1.3-.1 2.1-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM9.8 14.5v-5.1l5.7 2.6-5.7 2.5z"
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/14769426/",
    d: "M6.5 9H3v12h3.5V9zM4.75 3A2.1 2.1 0 102.7 5.1 2.1 2.1 0 004.75 3zM21 21h-3.5v-6.2c0-1.7-.6-2.8-2.1-2.8-1.1 0-1.8.8-2.1 1.5-.1.3-.1.6-.1.9V21H9.8s.05-10.8 0-12H13.3v1.9c.5-.8 1.4-1.9 3.4-1.9 2.5 0 4.3 1.6 4.3 5.1V21z"
  }
] as const;

function SocialDot({ label, href, path }: { label: string; href: string; path: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#2c3a33] text-white transition hover:bg-[#166D46]"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d={path} />
      </svg>
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

      {/* Desktop landing — form + tagline anchored so “More than a store” starts ~15% from right */}
      <div className="relative hidden min-h-screen w-full pb-[72px] lg:block">
        <div
          className="flex min-h-[calc(100vh-72px)] w-full items-stretch justify-end gap-8 px-6 pt-[6.5%] xl:gap-10"
          style={{ paddingRight: "max(0.75rem, calc(15% - 11rem))" }}
        >
          <section className="flex w-full max-w-[520px] shrink-0 flex-col justify-between xl:max-w-[540px]">
            <div>
              <SarvedaLogo iconHeight={92} tone="onLight" />
              <p className="mt-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.42em] text-[#6f7b67]">
                Yoga · Sound · Wellbeing
              </p>
              <h2 className="mt-6 font-serif text-[3.05rem] font-semibold leading-[1.02] tracking-[-0.05em] text-[#10201a] xl:text-[3.35rem]">
                Welcome to your
                <br />
                Sarveda space
              </h2>
              <p className="mt-4 max-w-[500px] text-base leading-7 text-[#4f5f56] xl:text-[17px] xl:leading-7">
                Track your orders, continue your courses, save your favourites, and return to the practices that
                support your daily wellbeing.
              </p>

              <div className="mt-6 grid max-w-[500px] grid-cols-3 gap-3.5">
                <BenefitCard
                  icon={<IconBag />}
                  title={
                    <>
                      Discover Sound
                      <br />
                      healing instruments
                    </>
                  }
                />
                <BenefitCard
                  icon={<IconGraduation />}
                  title={
                    <>
                      Access sound healing
                      <br />
                      courses and events
                    </>
                  }
                />
                <BenefitCard
                  icon={<IconPackage />}
                  title={
                    <>
                      Track orders
                      <br />
                      and events
                    </>
                  }
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-3.5">
                <Link
                  href="/store"
                  className="group inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full bg-[#c28a2b] px-8 text-[15px] font-bold text-white shadow-[0_14px_30px_rgba(194,138,43,0.26)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#ad7924]"
                >
                  Shop now <span className="transition duration-300 group-hover:translate-x-1">→</span>
                </Link>
                <Link
                  href="/courses"
                  className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-[#b98a3e] bg-white/75 px-8 text-[15px] font-bold text-[#9a6f2d] shadow-[0_10px_24px_rgba(28,53,42,0.06)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white"
                >
                  Explore courses
                </Link>
              </div>
            </div>

            <div className="mt-8 flex max-w-[520px] flex-wrap items-center gap-x-8 gap-y-3">
              <TrustStat icon={<IconGlobe />} line1="Worldwide" line2="shipping" />
              <TrustStat icon={<IconShield />} line1="Secure" line2="checkout" />
              <TrustStat icon={<IconPerson />} line1="20K+" line2="repeated customers" />
            </div>
          </section>

          <div className="flex min-h-[44rem] w-[30rem] shrink-0 flex-col rounded-[1.75rem] border border-[#ece4d7] bg-white px-8 py-9 shadow-[0_28px_70px_rgba(28,53,42,0.18),0_48px_140px_rgba(28,53,42,0.22)] xl:w-[31rem]">
            <div className="text-left">
              <h1 className="font-serif text-[2.15rem] font-semibold leading-tight tracking-[-0.05em] text-[#10201a]">
                {title}
              </h1>
              {subtitle ? <p className="mt-2.5 text-[15px] leading-relaxed text-[#526158]">{subtitle}</p> : null}
            </div>
            <div className="mt-6 flex-1">{children}</div>
            {footer ? <div className="mt-7 border-t border-[#eadfcd] pt-5">{footer}</div> : null}
          </div>

          {/* Peace words + tagline — left edge of this block sits at ~15% from right */}
          <aside className="hidden w-[11rem] shrink-0 self-center xl:block">
            <div className="space-y-3 font-serif text-[0.95rem] italic leading-none tracking-[0.12em] text-[#3f4f46]">
              <p>Practice</p>
              <p>Breathe</p>
              <p>Heal</p>
              <p>Belong</p>
            </div>
            <div className="mt-6 h-0.5 w-12 bg-[#c28a2b]" />
            <p className="mt-5 font-serif text-[1.45rem] italic leading-tight text-[#3f4f46]">
              More
              <br />
              than a store.
              <br />
              A way of life.
            </p>
          </aside>
        </div>

        {/* Quote sits on the dark stone (no blur plate) */}
        <p className="pointer-events-none absolute bottom-[6.2rem] left-[5%] max-w-[280px] font-serif text-[1.7rem] italic leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] xl:left-[6%] xl:text-[1.85rem]">
          “A calmer you,
          <br />
          a kinder world.”
        </p>

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
              {LOGIN_SOCIAL.map((s) => (
                <SocialDot key={s.label} label={s.label} href={s.href} path={s.d} />
              ))}
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
