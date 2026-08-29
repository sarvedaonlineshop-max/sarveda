"use client";

import { useEffect, useState } from "react";

import { AdminSkeleton } from "@/components/admin/AdminSkeleton";

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
        className="admin-spinner inline-block rounded-full border-2 border-[#b98a3e]/25 border-t-[#b98a3e]"
        style={{ width: size, height: size }}
        aria-hidden
      />
      <span className="text-xs font-medium text-[var(--admin-text-muted,#8a7060)]">{label}</span>
    </div>
  );
}

/**
 * Route-navigation feedback for the admin workspace.
 *
 * The thin progress line appears immediately. The structural skeleton waits a
 * moment so very fast navigations stay visually quiet instead of flashing a
 * full-screen loader. This is deliberately generic: it communicates that the
 * next admin view is being prepared without pretending to know the exact page.
 */
export function AdminLoadingOverlay({
  show,
  label = "Loading page…"
}: {
  show: boolean;
  label?: string;
}) {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!show) {
      setShowSkeleton(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSkeleton(true), 70);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!show) return null;

  return (
    <div className="admin-route-loading" aria-busy="true" aria-label={label}>
      <div className="admin-route-progress" aria-hidden>
        <span />
      </div>

      {showSkeleton ? (
        <div className="admin-route-skeleton" role="status" aria-live="polite">
          <span className="sr-only">{label}</span>

          <div className="admin-route-skeleton-heading">
            <div>
              <AdminSkeleton width="11rem" height={18} />
              <div style={{ marginTop: 10 }}>
                <AdminSkeleton width="23rem" height={10} />
              </div>
            </div>
            <AdminSkeleton width="7.5rem" height={34} style={{ borderRadius: 9 }} />
          </div>

          <div className="admin-route-skeleton-kpis">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="admin-route-skeleton-card">
                <AdminSkeleton width="45%" height={9} />
                <div style={{ marginTop: 14 }}>
                  <AdminSkeleton width="34%" height={22} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <AdminSkeleton width="68%" height={8} />
                </div>
              </div>
            ))}
          </div>

          <div className="admin-route-skeleton-panel">
            <div className="admin-route-skeleton-toolbar">
              <AdminSkeleton width="9rem" height={12} />
              <div className="admin-route-skeleton-toolbar-actions">
                <AdminSkeleton width="8rem" height={32} style={{ borderRadius: 8 }} />
                <AdminSkeleton width="6rem" height={32} style={{ borderRadius: 8 }} />
              </div>
            </div>

            <div className="admin-route-skeleton-table">
              {Array.from({ length: 6 }).map((_, row) => (
                <div className="admin-route-skeleton-row" key={row}>
                  <AdminSkeleton width={`${22 + (row % 3) * 7}%`} height={9} />
                  <AdminSkeleton width="18%" height={9} />
                  <AdminSkeleton width="14%" height={9} />
                  <AdminSkeleton width="10%" height={9} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
