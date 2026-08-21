import Link from "next/link";
import type { ReactNode } from "react";

import { SarvedaLogo, SarvedaLogoWatermark } from "@/components/brand/SarvedaLogo";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Login page uses light mode per product spec. */
  variant?: "light" | "dark";
};

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  variant = "dark"
}: AuthShellProps) {
  const isLight = variant === "light";

  return (
    <div
      className={
        isLight
          ? "relative min-h-screen overflow-hidden bg-brand-cream px-4 py-12 sm:px-6 lg:py-16"
          : "relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-stone-900 via-stone-950 to-black px-4 py-12 sm:px-6 lg:py-16"
      }
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <SarvedaLogoWatermark
          className={isLight ? "opacity-[0.06]" : "opacity-[0.08]"}
          height={240}
          tone={isLight ? "onLight" : "onDark"}
        />
      </div>
      <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-16">
        <div className="hidden text-center lg:block lg:text-left">
          <SarvedaLogo
            iconHeight={40}
            tone={isLight ? "onLight" : "onDark"}
          />
          <p
            className={`mt-4 max-w-md font-serif text-3xl leading-tight ${
              isLight ? "text-brand-ink" : "text-stone-100"
            }`}
          >
            A calm doorway into yoga and sound.
          </p>
          <p
            className={`mt-4 max-w-md text-base leading-relaxed ${
              isLight ? "text-brand-muted" : "text-stone-400"
            }`}
          >
            Sign in to save your cart, track orders, and return to the practices you love.
          </p>
          <div className="mt-8">
            <Link
              href="/shop"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-gold px-8 text-sm font-bold tracking-wide text-brand-night transition-colors hover:bg-[#a37934]"
            >
              Shop now
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {["169+ products", "Worldwide shipping", "Secure checkout"].map((label) => (
              <span
                key={label}
                className={
                  isLight
                    ? "rounded-full border border-brand-gold/30 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold"
                    : "rounded-full border border-amber-500/25 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200"
                }
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div
          className={
            isLight
              ? "rounded-3xl border border-brand-cream-dark bg-white p-8 shadow-card-hover sm:p-10"
              : "rounded-3xl border border-stone-700/80 bg-stone-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-10"
          }
        >
          <div className="text-center lg:text-left">
            <h1
              className={`font-serif text-3xl italic ${
                isLight ? "text-brand-forest" : "text-amber-400"
              }`}
            >
              {title}
            </h1>
            <p
              className={`mt-2 text-sm leading-relaxed ${
                isLight ? "text-brand-muted" : "text-stone-400"
              }`}
            >
              {subtitle}
            </p>
          </div>
          <div className="mt-8">{children}</div>
          {footer ? (
            <div
              className={`mt-8 border-t pt-6 ${
                isLight ? "border-brand-cream-dark/60" : "border-stone-800"
              }`}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
