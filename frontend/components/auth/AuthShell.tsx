import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-stone-900 via-stone-950 to-black px-4 py-12 sm:px-6 lg:py-16">
      <span
        className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 select-none text-[clamp(8rem,28vw,18rem)] leading-none text-amber-500/10"
        aria-hidden="true"
      >
        ☸
      </span>
      <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-16">
        <div className="hidden text-center lg:block lg:text-left">
          <Link href="/" className="inline-flex items-center gap-2 text-amber-400 transition-colors hover:text-amber-300">
            <span className="font-serif text-3xl italic">☸ Sarveda</span>
          </Link>
          <p className="mt-4 max-w-md font-serif text-3xl leading-tight text-stone-100">
            A calm doorway into yoga, Ayurveda, and sound.
          </p>
          <p className="mt-4 max-w-md text-base leading-relaxed text-stone-400">
            Sign in to save your cart, track orders, and return to the practices you love.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            {["169+ products", "Worldwide shipping", "Secure checkout"].map((label) => (
              <span
                key={label}
                className="rounded-full border border-amber-500/25 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-stone-700/80 bg-stone-900/90 p-8 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-10">
          <div className="text-center lg:text-left">
            <h1 className="font-serif text-3xl italic text-amber-400">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-stone-400">{subtitle}</p>
          </div>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t border-stone-800 pt-6">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
