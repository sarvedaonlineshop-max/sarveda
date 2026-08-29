"use client";

import type { CSSProperties } from "react";

type AdminSkeletonProps = {
  className?: string;
  style?: CSSProperties;
  /** Approximate height in px when not using className sizing */
  height?: number | string;
  width?: number | string;
};

/** Calm placeholder block — admin only. Respects prefers-reduced-motion via CSS. */
export function AdminSkeleton({ className = "", style, height = 16, width = "100%" }: AdminSkeletonProps) {
  return (
    <div
      className={`admin-skeleton ${className}`}
      style={{ height, width, ...style }}
      aria-hidden
    />
  );
}

export function AdminSkeletonLines({
  lines = 3,
  gap = 10
}: {
  lines?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <AdminSkeleton key={i} height={14} width={i === lines - 1 ? "68%" : "100%"} />
      ))}
    </div>
  );
}

/** Simple table-shaped skeleton for list first paint. */
export function AdminTableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700"
      role="status"
      aria-label="Loading table"
    >
      <div className="grid gap-0 border-b border-stone-100 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-950"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <AdminSkeleton key={`h-${i}`} height={12} width="70%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3 border-b border-stone-100 px-4 py-3 last:border-0 dark:border-stone-800"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <AdminSkeleton key={c} height={12} width={c === 0 ? "85%" : "60%"} />
          ))}
        </div>
      ))}
    </div>
  );
}
