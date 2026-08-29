"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Preserve developer visibility without exposing internals in the UI.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[54vh] max-w-2xl items-center justify-center px-6 py-16">
      <div className="admin-surface w-full rounded-[10px] border border-[var(--admin-card-border)] bg-[var(--admin-card-bg)] p-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
          <AlertTriangle size={20} aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-[var(--admin-text)]">This view could not be loaded</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--admin-text-muted)]">
          Something interrupted this admin screen. Try loading it again; your existing data has not been changed by this error screen.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex items-center gap-2 rounded-[8px] border border-[#1c352a] bg-[#1c352a] px-4 py-2 text-sm font-semibold text-white"
        >
          <RotateCcw size={15} aria-hidden />
          Try Again
        </button>
      </div>
    </div>
  );
}
