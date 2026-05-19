import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  duration?: number;
  className?: string;
  trackClassName?: string;
};

export function InfiniteMarquee({
  children,
  duration = 40,
  className = "",
  trackClassName = ""
}: Props) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div
        className={`flex w-max ${trackClassName}`}
        style={{ animation: `marquee ${duration}s linear infinite` }}
      >
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
