"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Notice = {
  id: string;
  type: "low_stock" | "sales" | "refund";
  title: string;
  detail: string;
  href: string;
};

export function AdminNotificationsBell({
  inputBg,
  inputBorder,
  mutedColor
}: {
  inputBg: string;
  inputBorder: string;
  mutedColor: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/notifications", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { data?: { items?: Notice[] } }) => {
        if (!cancelled) setItems(json.data?.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const count = items.length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "8px",
          background: inputBg,
          border: `1px solid ${inputBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: mutedColor,
          position: "relative"
        }}
        title="Notifications"
        aria-expanded={open}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 ? (
          <span
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              background: "#c45a2a"
            }}
          />
        ) : null}
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "320px",
            maxHeight: "360px",
            overflowY: "auto",
            borderRadius: "12px",
            border: `1px solid ${inputBorder}`,
            background: inputBg,
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            zIndex: 50
          }}
        >
          <p style={{ padding: "12px 14px", fontSize: "13px", fontWeight: 600, color: mutedColor }}>
            Notifications
          </p>
          {items.length === 0 ? (
            <p style={{ padding: "0 14px 14px", fontSize: "12px", color: mutedColor }}>All clear for now.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: "0 0 8px 0" }}>
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: "block",
                      padding: "10px 14px",
                      borderTop: `1px solid ${inputBorder}`,
                      textDecoration: "none"
                    }}
                  >
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "#1e3a2f", margin: 0 }}>{item.title}</p>
                    <p style={{ fontSize: "11px", color: mutedColor, margin: "4px 0 0" }}>{item.detail}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
