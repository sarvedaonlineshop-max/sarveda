"use client";

import { useEffect, useRef, useState } from "react";
import { fetchAdminMeSessions, type AdminSessionRow } from "@/lib/admin-api";
import { logoutSession } from "@/lib/auth-client";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata"
  });
}

export function AdminProfileMenu({
  inputBg,
  inputBorder,
  mutedColor,
  titleColor
}: {
  inputBg: string;
  inputBorder: string;
  mutedColor: string;
  titleColor: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Admin");
  const [email, setEmail] = useState("");
  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAdminMeSessions()
      .then((d) => {
        if (cancelled) return;
        setName(d.user.name?.trim() || d.user.email.split("@")[0] || "Admin");
        setEmail(d.user.email);
        setSessions(d.sessions);
      })
      .catch(() => {
        /* keep defaults until panel opens */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function openPanel() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setLoading(true);
    setErr(null);
    try {
      const d = await fetchAdminMeSessions();
      setName(d.user.name?.trim() || d.user.email.split("@")[0] || "Admin");
      setEmail(d.user.email);
      setSessions(d.sessions);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => void openPanel()}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "6px 12px 6px 6px",
          borderRadius: "10px",
          background: inputBg,
          border: `1px solid ${inputBorder}`,
          cursor: "pointer",
          maxWidth: "220px"
        }}
      >
        <div
          style={{
            width: "30px",
            height: "30px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #1e3a2f, #4a7c59)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div style={{ textAlign: "left", minWidth: 0 }}>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: titleColor,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {name}
          </p>
          <p style={{ fontSize: "10px", color: mutedColor, lineHeight: 1.2 }}>Store ops</p>
        </div>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Login history"
          className="admin-menu-panel"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "340px",
            maxWidth: "min(340px, 92vw)",
            background: "#fff",
            border: "1px solid #e8e2d9",
            borderRadius: "12px",
            boxShadow: "0 12px 40px rgba(44,36,32,0.18)",
            zIndex: 80,
            overflow: "hidden"
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0ece6" }}>
            <p style={{ fontSize: "14px", fontWeight: 700, color: "#2c2420" }}>{name}</p>
            <p style={{ fontSize: "12px", color: "#8a7060", marginTop: "2px" }}>{email}</p>
          </div>
          <div style={{ padding: "10px 16px 6px" }}>
            <p
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#8a7060",
                marginBottom: "8px"
              }}
            >
              Login history
            </p>
            {loading ? (
              <p style={{ fontSize: "13px", color: "#8a7060", padding: "12px 0" }}>Loading…</p>
            ) : err ? (
              <p style={{ fontSize: "13px", color: "#dc2626", padding: "12px 0" }}>{err}</p>
            ) : sessions.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#8a7060", padding: "12px 0" }}>
                No sessions recorded yet. History starts from your next login.
              </p>
            ) : (
              <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid #f0ece6",
                      fontSize: "12px",
                      color: "#4a3f38"
                    }}
                  >
                    <p>
                      <span style={{ fontWeight: 600, color: "#166534" }}>In</span>{" "}
                      {formatWhen(s.loginAt)}
                    </p>
                    <p style={{ marginTop: "4px" }}>
                      <span style={{ fontWeight: 600, color: s.logoutAt ? "#92400e" : "#8a7060" }}>
                        Out
                      </span>{" "}
                      {s.logoutAt ? formatWhen(s.logoutAt) : "Still signed in"}
                    </p>
                    {s.ip ? (
                      <p style={{ marginTop: "4px", color: "#8a7060", fontSize: "11px" }}>IP {s.ip}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ padding: "10px 12px 12px", borderTop: "1px solid #f0ece6" }}>
            <button
              type="button"
              onClick={async () => {
                await logoutSession();
                window.location.href = "/";
              }}
              style={{
                width: "100%",
                height: "36px",
                borderRadius: "8px",
                border: "1px solid #e0d8ce",
                background: "#f9f7f4",
                color: "#2c2420",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
