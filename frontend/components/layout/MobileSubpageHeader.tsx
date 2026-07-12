"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type MobileSubpageHeaderProps = {
  title: string;
  backHref?: string;
  backLabel?: string;
  trailing?: ReactNode;
};

export function MobileSubpageHeader({
  title,
  backHref,
  backLabel = "Back",
  trailing
}: MobileSubpageHeaderProps) {
  const router = useRouter();

  return (
    <div className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => (backHref ? router.push(backHref) : router.back())}
          className="inline-flex h-10 min-w-[40px] items-center justify-center rounded-full text-stone-700"
          aria-label={backLabel}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate font-serif text-lg font-semibold text-stone-900">{title}</h1>
        {trailing ? <div className="flex max-w-[55%] flex-wrap items-center justify-end gap-1.5">{trailing}</div> : (
        <Link href="/" className="text-xs font-medium text-amber-700">
          Home
        </Link>
        )}
      </div>
    </div>
  );
}
