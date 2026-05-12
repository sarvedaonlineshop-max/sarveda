"use client";

import type { ReactNode } from "react";

type HorizontalSnapRowProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

export function HorizontalSnapRow({ children, className = "", ariaLabel }: HorizontalSnapRowProps) {
  return (
    <div
      className={`scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pt-1 [-webkit-overflow-scrolling:touch] ${className}`}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export function HorizontalSnapItem({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`snap-start shrink-0 ${className}`}>{children}</div>;
}
