"use client";

import { useEffect, useState } from "react";

import { getApiBase } from "@/lib/api";

type Prefs = {
  orderNotifications: boolean;
  chatNotifications: boolean;
};

export function AdminNotificationPrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"order" | "chat" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${getApiBase()}/api/admin/notification-preferences`, {
      credentials: "include"
    })
      .then(async (res) => {
        const json = (await res.json()) as { success?: boolean; data?: Prefs };
        if (!res.ok || !json.data) throw new Error("Could not load notification settings");
        return json.data;
      })
      .then((data) => {
        if (!cancelled) setPrefs(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load notification settings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!prefs || saving) return;
    const next = !prefs[key];
    setSaving(key === "orderNotifications" ? "order" : "chat");
    setError(null);
    setPrefs({ ...prefs, [key]: next });
    try {
      const res = await fetch(`${getApiBase()}/api/admin/notification-preferences`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next })
      });
      const json = (await res.json()) as { success?: boolean; data?: Prefs };
      if (!res.ok || !json.data) throw new Error("save failed");
      setPrefs(json.data);
    } catch {
      setPrefs(prefs);
      setError("Could not save. Try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      style={{
        padding: "16px",
        marginBottom: "12px",
        background: "#fff",
        borderRadius: "16px",
        border: "1px solid #e0d8ce"
      }}
    >
      <p style={{ fontSize: "14px", fontWeight: 700, color: "#2c2420", marginBottom: "4px" }}>
        Notifications
      </p>
      <p style={{ fontSize: "12px", color: "#8a7060", marginBottom: "14px", lineHeight: 1.45 }}>
        These switches are for your admin account only. Off stops the browser alerts. Other admins are unchanged.
      </p>
      <ToggleRow
        label="Order notifications"
        detail="New paid orders, today’s sales, and refunds"
        checked={prefs?.orderNotifications ?? true}
        disabled={!prefs || saving === "order"}
        onChange={() => void toggle("orderNotifications")}
      />
      <ToggleRow
        label="Chat notifications"
        detail="New chats and customer replies"
        checked={prefs?.chatNotifications ?? true}
        disabled={!prefs || saving === "chat"}
        onChange={() => void toggle("chatNotifications")}
      />
      {error ? (
        <p style={{ fontSize: "12px", color: "#dc2626", marginTop: "8px" }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  disabled,
  onChange
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "10px 0",
        borderTop: "1px solid #f0e8dc"
      }}
    >
      <div>
        <p style={{ fontSize: "14px", fontWeight: 700, color: "#2c2420" }}>{label}</p>
        <p style={{ fontSize: "12px", color: "#8a7060", marginTop: "2px" }}>{detail}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          border: "none",
          padding: 3,
          cursor: disabled ? "wait" : "pointer",
          background: checked ? "#075E54" : "#d5cdc2",
          flexShrink: 0
        }}
      >
        <span
          style={{
            display: "block",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fff",
            transform: checked ? "translateX(20px)" : "translateX(0)",
            transition: "transform 0.15s ease"
          }}
        />
      </button>
    </div>
  );
}
