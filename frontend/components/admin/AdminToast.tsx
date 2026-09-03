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

  let background = "#15803d";
  let border = "#166534";
  let color = "#ffffff";
  let icon = "✓";
  if (isError) {
    background = "#dc2626";
    border = "#b91c1c";
    color = "#ffffff";
    icon = "✗";
  } else if (isWarning) {
    background = "#d97706";
    border = "#b45309";
    color = "#ffffff";
    icon = "!";
  } else if (isInfo) {
    background = "#2563eb";
    border = "#1d4ed8";
    color = "#ffffff";
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
            bottom: "28px",
            left: "50%",
            right: "auto",
            zIndex: 110,
            maxWidth: "480px",
            width: "min(480px, calc(100vw - 32px))",
            padding: "14px 20px",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: 600,
            boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 14px 36px rgba(0,0,0,0.22)",
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
              x: "-50%",
              transition: reduceMotion ? zero : adminToastTransition
            },
            hide: {
              opacity: 0,
              y: reduceMotion ? 0 : 8,
              x: "-50%",
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
