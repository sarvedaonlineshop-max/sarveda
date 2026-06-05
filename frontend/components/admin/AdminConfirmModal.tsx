"use client";

type AdminConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
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
  open, title, message,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  secondaryConfirmLabel, onSecondaryConfirm,
  danger, busy, onConfirm, onClose
}: AdminConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.45)", padding: "16px",
        backdropFilter: "blur(4px)"
      }}
      role="dialog" aria-modal="true" aria-labelledby="confirm-title"
    >
      <div style={{
        width: "100%", maxWidth: "440px",
        background: "#ffffff", borderRadius: "16px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
        overflow: "hidden"
      }}>
        {/* Header stripe */}
        <div style={{
          background: danger ? "#fef2f2" : "#f4f1ec",
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${danger ? "#fecaca" : "#e8e2d9"}`
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0,
              background: danger ? "#fee2e2" : "rgba(30,58,47,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {danger ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e3a2f" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>
            <h2 id="confirm-title" style={{ fontSize: "16px", fontWeight: 700, color: "#2c2420" }}>
              {title}
            </h2>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px" }}>
          <p style={{ fontSize: "14px", lineHeight: 1.65, color: "#6b5c52" }}>{message}</p>
        </div>

        {/* Actions */}
        <div style={{
          padding: "0 24px 20px",
          display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "10px"
        }}>
          <button
            type="button" disabled={busy} onClick={onClose}
            style={{
              padding: "9px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 500,
              border: "1px solid #e0d8ce", background: "#ffffff", color: "#6b5c52",
              cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1
            }}
          >
            {cancelLabel}
          </button>
          {secondaryConfirmLabel && onSecondaryConfirm && (
            <button
              type="button" disabled={busy} onClick={onSecondaryConfirm}
              style={{
                padding: "9px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                border: "1px solid #c8960a", background: "rgba(200,150,10,0.08)", color: "#8a6200",
                cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1
              }}
            >
              {secondaryConfirmLabel}
            </button>
          )}
          <button
            type="button" disabled={busy} onClick={onConfirm}
            style={{
              padding: "9px 18px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
              border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
              background: danger ? "#dc2626" : "#1e3a2f",
              color: "#ffffff"
            }}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
