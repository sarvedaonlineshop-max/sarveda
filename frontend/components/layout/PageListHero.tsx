import type { ReactNode } from "react";

type Props = {
  variant?: "violet" | "sage" | "corporate";
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
  topSlot?: ReactNode;
};

export function PageListHero({ variant = "violet", eyebrow, title, subtitle, topSlot }: Props) {
  const isSage = variant === "sage";
  const isCorporate = variant === "corporate";

  const background = isSage
    ? "linear-gradient(160deg, #3D5C3D 0%, #5A8C6B 100%)"
    : isCorporate
      ? "linear-gradient(160deg, #22134A 0%, #3A2070 50%, #1E3A2F 100%)"
      : "linear-gradient(160deg, #22134A 0%, #3A2070 60%, #5B3E9B 100%)";

  return (
    <div
      className="relative overflow-hidden border-b"
      style={{
        background,
        borderBottomColor: "rgba(196,176,232,0.15)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full"
        style={{
          background: isSage
            ? "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(196,176,232,0.06) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14 lg:px-8">
        {topSlot}
        <p
          className="text-[10px] font-normal uppercase tracking-[0.18em]"
          style={{ color: isSage ? "rgba(255,255,255,0.7)" : "#C4B0E8" }}
        >
          {eyebrow}
        </p>
        <h1
          className={`display-text mt-3 text-5xl font-light leading-tight md:text-[56px] ${
            isSage ? "text-white" : "text-brand-violet-pale"
          }`}
        >
          {title}
        </h1>
        <p
          className="mt-4 max-w-2xl text-[15px] font-light tracking-[0.02em]"
          style={{ color: isSage ? "rgba(255,255,255,0.55)" : "rgba(196,176,232,0.55)" }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
