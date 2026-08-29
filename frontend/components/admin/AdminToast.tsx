"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { adminToastExitTransition, adminToastTransition } from "@/lib/admin-motion";

export function AdminToast({
  toast,
  onDismiss
}: {
  toast: { message: string; error?: boolean; tone?: "success" | "error" | "warning" | "info" } | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 5200);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  const reduceMotion = useReducedMotion();
  const zero = { duration: 0 };
  const isError = Boolean(toast?.error || toast?.tone === "error");
  const isWarning = toast?.tone === "warning";
  const isInfo = toast?.tone === "info";

  let background = "#f0fdf4";
  let border = "#bbf7d0";
  let color = "#166534";
  let icon = "✓";
  if (isError) {
    background = "#fef2f2";
    border = "#fecaca";
    color = "#991b1b";
    icon = "✗";
  } else if (isWarning) {
    background = "#fffbeb";
    border = "#fde68a";
    color = "#92400e";
    icon = "!";
  } else if (isInfo) {
    background = "#eff6ff";
    border = "#bfdbfe";
    color = "#1e40af";
    icon = "i";
  }

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          key={`${toast.message}-${isError ? "e" : toast.tone ?? "s"}`}
          role="status"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 110,
            maxWidth: "420px",
            width: "min(420px, calc(100vw - 32px))",
            padding: "12px 18px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: 500,
            boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 12px 34px rgba(0,0,0,0.14)",
            background,
            border: `1px solid ${border}`,
            color,
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}
          variants={{
            show: {
              opacity: 1,
              y: 0,
              x: 0,
              transition: reduceMotion ? zero : adminToastTransition
            },
            hide: {
              opacity: 0,
              y: reduceMotion ? 0 : 6,
              x: 0,
              transition: reduceMotion ? zero : adminToastExitTransition
            }
          }}
          initial={reduceMotion ? false : "hide"}
          animate="show"
          exit="hide"
        >
          <span style={{ fontSize: "16px" }}>{icon}</span>
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            data-no-press
            style={{
              border: "none",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              opacity: 0.7,
              padding: "2px 4px",
              fontSize: "14px",
              lineHeight: 1
            }}
          >
            ×
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
