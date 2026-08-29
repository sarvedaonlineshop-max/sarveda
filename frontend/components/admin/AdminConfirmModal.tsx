"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import {
  adminModalExitTransition,
  adminModalTransition,
  adminOverlayTransition
} from "@/lib/admin-motion";

type AdminConfirmModalProps = {
  open: boolean;
  title: string;
  message?: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  secondaryConfirmLabel?: string;
  onSecondaryConfirm?: () => void;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function AdminConfirmModal({
  open,
  title,
  message,
  details,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  secondaryConfirmLabel,
  onSecondaryConfirm,
  danger,
  busy,
  onConfirm,
  onClose
}: AdminConfirmModalProps) {
  const reduceMotion = useReducedMotion();
  const zero = { duration: 0 };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="admin-confirm-root"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px"
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={reduceMotion ? zero : adminOverlayTransition}
        >
          <motion.div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(4px)"
            }}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={reduceMotion ? zero : adminOverlayTransition}
          />
          <motion.div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: details?.length ? "520px" : "440px",
              background: "#ffffff",
              borderRadius: "12px",
              border: "1px solid rgba(31,33,30,0.12)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 18px 50px rgba(0,0,0,0.18)",
              overflow: "hidden"
            }}
            variants={{
              open: {
                opacity: 1,
                scale: 1,
                y: 0,
                transition: reduceMotion ? zero : adminModalTransition
              },
              closed: {
                opacity: 0,
                scale: reduceMotion ? 1 : 0.985,
                y: reduceMotion ? 0 : 6,
                transition: reduceMotion ? zero : adminModalExitTransition
              }
            }}
            initial={reduceMotion ? false : "closed"}
            animate="open"
            exit="closed"
          >
            <div
              style={{
                background: danger ? "#fef2f2" : "#f4f1ec",
                padding: "20px 24px 16px",
                borderBottom: `1px solid ${danger ? "#fecaca" : "#e8e2d9"}`
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "10px",
                    flexShrink: 0,
                    background: danger ? "#fee2e2" : "rgba(30,58,47,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {danger ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="2"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1e3a2f"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  )}
                </div>
                <h2 id="confirm-title" style={{ fontSize: "16px", fontWeight: 700, color: "#2c2420" }}>
                  {title}
                </h2>
              </div>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {message ? (
                <p style={{ fontSize: "14px", lineHeight: 1.65, color: "#6b5c52" }}>{message}</p>
              ) : null}
              {details && details.length > 0 ? (
                <ul
                  style={{
                    margin: message ? "12px 0 0" : 0,
                    paddingLeft: 18,
                    maxHeight: 220,
                    overflowY: "auto",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "#6b5c52"
                  }}
                >
                  {details.map((item) => (
                    <li key={item} style={{ marginBottom: 6 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div
              style={{
                padding: "0 24px 20px",
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                gap: "10px"
              }}
            >
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  border: "1px solid #e0d8ce",
                  background: "#ffffff",
                  color: "#6b5c52",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.5 : 1
                }}
              >
                {cancelLabel}
              </button>
              {secondaryConfirmLabel && onSecondaryConfirm ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onSecondaryConfirm}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: "1px solid #c8960a",
                    background: "rgba(200,150,10,0.08)",
                    color: "#8a6200",
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.5 : 1
                  }}
                >
                  {secondaryConfirmLabel}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  border: "none",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.5 : 1,
                  background: danger ? "#dc2626" : "#1e3a2f",
                  color: "#ffffff"
                }}
              >
                {busy ? "Please wait…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
