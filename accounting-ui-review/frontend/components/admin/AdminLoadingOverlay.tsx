"use client";

export function AdminLoadingSpinner({
  label = "Loading…",
  size = 28
}: {
  label?: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <span
        className="admin-nav-spinner inline-block rounded-full border-2 border-[#b98a3e]/25 border-t-[#b98a3e]"
        style={{ width: size, height: size }}
        aria-hidden
      />
      <span className="text-xs font-medium text-[var(--admin-text-muted,#8a7060)]">{label}</span>
    </div>
  );
}

export function AdminLoadingOverlay({
  show,
  label = "Loading…"
}: {
  show: boolean;
  label?: string;
}) {
  if (!show) return null;
  return (
    <div
      className="absolute inset-0 z-20 flex items-start justify-center bg-[var(--admin-workspace-bg,#f1ede4)]/70 pt-24 backdrop-blur-[1px] dark:bg-[var(--admin-workspace-bg,#0c1a10)]/75"
      aria-busy="true"
    >
      <div className="rounded-xl border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-card-bg,#fff)] px-8 py-6 shadow-lg">
        <AdminLoadingSpinner label={label} />
      </div>
    </div>
  );
}
