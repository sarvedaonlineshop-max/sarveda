"use client";

import { useEffect } from "react";

export function AdminToast({
  toast,
  onDismiss
}: {
  toast: { message: string; error?: boolean } | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 5200);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-[110] max-w-md -translate-x-1/2 rounded-lg border px-4 py-3 text-sm shadow-xl ${
        toast.error
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
      }`}
      role="status"
    >
      {toast.message}
    </div>
  );
}
