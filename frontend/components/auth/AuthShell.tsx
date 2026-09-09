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
};

const LOGIN_BACKGROUND_ASSET = "/assets/auth/sarveda-login-background.png";
const LOGIN_BACKGROUND_MOBILE_ASSET = "/assets/auth/sarveda-login-background-mobile.jpg";

/** Person / profile — for repeat customers. */
function IconPerson() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.55" />
      <path
        d="M5.5 19.2c.8-3.2 3.2-5 6.5-5s5.7 1.8 6.5 5"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.55" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.55" />
      <path
        d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z"
        stroke="currentColor"
        strokeWidth="1.55"
      />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 5 6.2v5.3c0 4.4 2.9 7.5 7 8.8 4.1-1.3 7-4.4 7-8.8V6.2L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BenefitCard({ imageSrc, imageAlt, title }: { imageSrc: string; imageAlt: string; title: ReactNode }) {
  return (
    <div className="group flex min-h-[9.25rem] flex-col justify-center rounded-xl border border-[#e7dcc9]/90 bg-white/85 px-3 py-3.5 text-center shadow-[0_10px_28px_rgba(28,53,42,0.07)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:border-[#c89435]/70 hover:bg-white hover:shadow-[0_18px_44px_rgba(28,53,42,0.14)]">
      <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center overflow-hidden transition duration-300 group-hover:scale-105">
        {/* eslint-disable-next-line @next/next/no-img-element -- small static auth asset */}
        <img src={imageSrc} alt={imageAlt} width={64} height={64} className="h-full w-full object-contain" />
      </div>
      <div className="text-[12.5px] font-semibold leading-[1.28] text-[#10201a]">{title}</div>
    </div>
  );
}

function PeaceWords({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="space-y-3.5 font-sans text-[0.68rem] font-semibold uppercase leading-none tracking-[0.32em] text-[#3f4f46]">
        <p>Practice</p>
        <p>Breathe</p>
        <p>Heal</p>
        <p>Belong</p>
      </div>
      <div className="mt-6 h-px w-10 bg-[#c28a2b]" />
      <p className="mt-4.5 font-serif text-[1.4rem] font-normal italic leading-[1.25] tracking-normal text-[#3f4f46]">
        More
        <br />
        than a store.
        <br />
        A way of life.
      </p>
    </div>
  );
}

/** Trust row under Shop now — deliberately quieter than the primary actions. */
function TrustStat({ icon, line1, line2 }: { icon: ReactNode; line1: string; line2: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="shrink-0 text-[#166D46]/90">{icon}</span>
      <span className="text-[12.5px] font-semibold leading-tight text-[#166D46]/90">
        {line1}
        <br />
        {line2}
      </span>
    </div>
  );
}

function ShopNowArrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="ml-0.5">
      <path
        d="M4 12h14.5M13.5 6.5 20 12l-6.5 5.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  variant = "dark",
  showMobileLogo = false,
  compactMobile = false
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

  return (
    <div className="relative min-h-dvh bg-transparent font-sans text-[#10201a] xl:min-h-screen xl:bg-[#f8f1e7]">
      <div
        className="pointer-events-none absolute inset-0 hidden bg-no-repeat xl:block"
        style={{
          backgroundImage: `url(${LOGIN_BACKGROUND_ASSET})`,
          backgroundSize: "auto 105%",
          backgroundPosition: "left bottom"
        }}
        aria-hidden="true"
      />

      {/* Scenic desktop composition starts at xl; tablet/laptop widths use the safer compact shell. */}
      <div className="relative hidden min-h-screen w-full pb-[72px] xl:block">
        <div
          className="flex min-h-[calc(100vh-72px)] w-full items-start justify-end gap-5 px-5 2xl:gap-7"
          style={{
            paddingRight: "max(1rem, calc(10% - 6rem))",
            paddingTop: "clamp(4.6rem, calc(0.72in + 1.8vh), 7rem)"
          }}
        >
          <section className="flex w-full max-w-[500px] shrink-0 flex-col 2xl:max-w-[540px]">
            <SarvedaLogo iconHeight={176} widthPx={280} tone="onLight" />
            <p className="mt-2 font-serif text-[0.85rem] font-normal italic tracking-[0.04em] text-[#3f4f46]">
              Sound Healing · Yoga · Conscious Living
            </p>
            <h2 className="mt-5 font-serif text-[2.85rem] font-semibold leading-[1.02] tracking-[-0.05em] text-[#10201a] 2xl:text-[3.25rem]">
              Welcome to your
              <br />
              Sarveda space
            </h2>
            <p className="mt-3.5 max-w-[500px] font-serif text-[1.08rem] font-normal italic leading-[1.5] tracking-normal text-[#3f4f46] 2xl:text-[1.18rem] 2xl:leading-[1.55]">
              Track your orders, continue your courses, save your favourites, and return to the practices that
              support your daily wellbeing.
            </p>

            <div className="mt-5 grid max-w-[520px] grid-cols-3 gap-2.5 2xl:gap-3.5">
              <BenefitCard
                imageSrc="/assets/auth/benefits/instruments.png"
                imageAlt="Sound healing instruments"
                title={
                  <>
                    Discover Sound
                    <br />
                    healing instruments
                  </>
                }
              />
              <BenefitCard
                imageSrc="/assets/auth/benefits/courses.png"
                imageAlt="Sound healing courses and events"
                title={
                  <>
                    Access sound healing
                    <br />
                    courses and events
                  </>
                }
              />
              <BenefitCard
                imageSrc="/assets/auth/benefits/orders.png"
                imageAlt="Track orders and events"
                title={
                  <>
                    Track orders
                    <br />
                    and events
                  </>
                }
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/store"
                className="inline-flex min-h-[46px] items-center justify-center rounded-full bg-[#c28a2b] px-7 text-[14px] font-bold text-white shadow-[0_14px_30px_rgba(194,138,43,0.26)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#ad7924]"
              >
                Shop now
                <ShopNowArrow />
              </Link>
              <Link
                href="/courses"
                className="inline-flex min-h-[46px] items-center justify-center rounded-full border border-[#b98a3e] bg-transparent px-7 text-[14px] font-bold text-[#b98a3e] transition duration-300 hover:-translate-y-0.5 hover:bg-white/50"
              >
                Explore courses
              </Link>
            </div>

            <div className="mt-4.5 max-w-[500px] border-t border-[#166D46]/25 pt-4 pl-5">
              <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5">
                <TrustStat icon={<IconGlobe />} line1="Worldwide" line2="shipping" />
                <TrustStat icon={<IconShield />} line1="Secure" line2="checkout" />
                <TrustStat icon={<IconPerson />} line1="20K+" line2="happy customers" />
              </div>
            </div>
          </section>

          <div className="flex shrink-0 items-start gap-5 2xl:gap-6">
            <div className="flex w-[25.75rem] flex-col rounded-[1.65rem] border border-[#ece4d7] bg-white px-6 py-7 shadow-[0_24px_64px_rgba(28,53,42,0.16),0_44px_120px_rgba(28,53,42,0.18)] transition-all duration-300 2xl:w-[26.5rem] 2xl:px-7">
              <div className="text-left">
                <h1 className="font-serif text-[1.9rem] font-semibold leading-tight tracking-[-0.05em] text-[#10201a]">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-2 font-serif text-[14px] font-normal italic leading-relaxed text-[#526158]">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <div className="mt-4.5 flex flex-col">
                <div>{children}</div>
                {footer ? <div className="mt-4.5">{footer}</div> : null}
              </div>
            </div>

            {/* Decorative copy is reserved for roomy desktop widths so it never crowds the form. */}
            <aside className="hidden w-[9.5rem] shrink-0 pt-[4.2rem] 2xl:block">
              <PeaceWords />
            </aside>
          </div>
        </div>

        <p className="pointer-events-none absolute bottom-[6rem] left-[5%] max-w-[280px] font-serif text-[1.6rem] italic leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] 2xl:left-[6%] 2xl:text-[1.8rem]">
          “A calmer you,
          <br />
          a kinder world.”
        </p>

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

      {/* Mobile / tablet — single-screen layout, no page scroll */}
      <div className="fixed inset-0 z-10 overflow-hidden xl:hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-no-repeat"
          style={{
            backgroundImage: `url(${LOGIN_BACKGROUND_MOBILE_ASSET})`,
            backgroundPosition: "center bottom"
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 flex h-full flex-col px-4 pb-[calc(2.75rem+env(safe-area-inset-bottom,0px))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6">
          <header className="mb-1 flex shrink-0 flex-col items-center pt-0.5 text-center">
            <SarvedaLogo iconHeight={88} widthPx={140} tone="onLight" />
            <p className="-mt-0.5 font-serif text-[0.78rem] font-normal italic tracking-[0.04em] text-[#3f4f46] sm:text-[0.85rem]">
              Sound Healing · Yoga · Conscious Living
            </p>
          </header>

          <div className="mx-auto flex w-full max-w-[24.5rem] flex-1 flex-col justify-start pt-1">
            <div className="rounded-[1.35rem] border border-[#ece4d7]/90 bg-white px-4 py-3.5 shadow-[0_18px_48px_rgba(28,53,42,0.16)] sm:px-5 sm:py-4">
              <div className="text-center">
                <h1 className="font-serif text-[1.55rem] font-semibold leading-tight tracking-[-0.04em] text-[#10201a]">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-1 font-serif text-[13px] font-normal italic leading-snug text-[#526158]">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <div className="mt-3">{children}</div>
              {footer ? <div className="mt-2">{footer}</div> : null}
            </div>
          </div>
        </div>

        <footer className="fixed bottom-0 left-0 right-0 z-30 flex h-[2.75rem] items-center justify-between border-t border-[#eadfcd] bg-white px-4 text-[10px] text-[#526158] sm:px-6 sm:text-[11px] xl:hidden">
          <p className="shrink-0">© 2026 Sarveda. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-end gap-x-1.5 text-right">
            <Link href="/privacy" className="hover:text-[#4a8c3f]">
              Privacy
            </Link>
            <span className="text-[#cdbda2]">|</span>
            <Link href="/terms" className="hover:text-[#4a8c3f]">
              Terms
            </Link>
            <span className="text-[#cdbda2]">|</span>
            <Link href="/contact" className="hover:text-[#4a8c3f]">
              Contact
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
