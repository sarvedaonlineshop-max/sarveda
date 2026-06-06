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
      style={{
        position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
        zIndex: 110, maxWidth: "440px", width: "calc(100vw - 48px)",
        padding: "12px 18px", borderRadius: "10px",
        fontSize: "13px", fontWeight: 500,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        background: toast.error ? "#fef2f2" : "#f0fdf4",
        border: `1px solid ${toast.error ? "#fecaca" : "#bbf7d0"}`,
        color: toast.error ? "#991b1b" : "#166534",
        display: "flex", alignItems: "center", gap: "10px"
      }}
      role="status"
    >
      <span style={{ fontSize: "16px" }}>{toast.error ? "✗" : "✓"}</span>
      {toast.message}
    </div>
  );
}
