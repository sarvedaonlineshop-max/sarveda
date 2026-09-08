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

const LOGIN_BACKGROUND_ASSET = "/assets/auth/sarveda-login-background.webp";

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
