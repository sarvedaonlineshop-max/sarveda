import Link from "next/link";
import type { ReactNode } from "react";

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
          ? "relative min-h-screen overflow-hidden bg-[#fdf6ed] px-4 py-12 sm:px-6 lg:py-16"
          : "relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-stone-900 via-stone-950 to-black px-4 py-12 sm:px-6 lg:py-16"
      }
    >
      <span
        className={`pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 select-none text-[clamp(8rem,28vw,18rem)] leading-none ${
          isLight ? "text-amber-600/10" : "text-amber-500/10"
        }`}
        aria-hidden="true"
      >
        ☸
      </span>
      <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-16">
        <div className="hidden text-center lg:block lg:text-left">
          <Link
            href="/"
            className={`inline-flex items-center gap-2 transition-colors ${
              isLight ? "text-brand-forest hover:text-brand-sage" : "text-amber-400 hover:text-amber-300"
            }`}
          >
            <span className="font-serif text-3xl italic">☸ Sarveda</span>
          </Link>
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
              className="inline-flex min-h-[48px] items-center justify-center rounded-full px-8 text-sm font-bold tracking-wide text-brand-night shadow-gold transition-all hover:shadow-gold-lg hover:opacity-95"
              style={{
                background: "linear-gradient(135deg,#e8b012 0%,#f5d88a 50%,#c8960a 100%)"
              }}
            >
              Shop Now
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {["169+ products", "Worldwide shipping", "Secure checkout"].map((label) => (
              <span
                key={label}
                className={
                  isLight
                    ? "rounded-full border border-amber-200 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-sage"
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
              ? "rounded-3xl border border-stone-200 bg-white p-8 shadow-xl shadow-stone-200/60 sm:p-10"
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
                isLight ? "border-stone-100" : "border-stone-800"
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
