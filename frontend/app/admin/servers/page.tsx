"use client";

import { useCallback, useEffect, useState } from "react";
import { Server } from "lucide-react";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { AdminApiError } from "@/lib/admin-errors";
import { fetchServersSnapshot, type ServersSnapshot } from "@/lib/admin-servers";
import { isServersDashboardEmail } from "@/lib/servers-access";

const card: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  padding: "18px 20px"
};

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function processLabel(name: string): string {
  if (name === "sarveda-frontend-preview") return "Frontend (shop and admin)";
  if (name === "sarveda-backend") return "Backend (API)";
  return name;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={card}>
      <p style={{ margin: 0, fontSize: "13px", letterSpacing: "0.04em", textTransform: "uppercase", color: "#8a7060" }}>
        {label}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: "28px", fontWeight: 700, color: "#1e3a2f" }}>{value}</p>
      {hint ? <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#6b6258" }}>{hint}</p> : null}
    </div>
  );
}

export default function AdminServersPage() {
  const user = useAdminUser();
  const allowed = isServersDashboardEmail(user?.email);
  const [data, setData] = useState<ServersSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(allowed);

  useAdminPageHeader(
    () => ({
      title: "Servers",
      subtitle: "Today, India time",
      icon: <Server size={18} />
    }),
    []
  );

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      setData(await fetchServersSnapshot());
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Could not load server status");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    void load();
    if (!allowed) return;
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [allowed, load]);

  if (!allowed) {
    return (
      <div style={{ ...card, maxWidth: 560 }}>
        <p style={{ margin: 0 }}>Servers is limited to the store owner.</p>
      </div>
    );
  }

  const t = data?.traffic;

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <p style={{ margin: 0, fontSize: "14px", color: "#5c5348", maxWidth: 760 }}>
        If the frontend process stops, the shop and this admin stop together until it starts again.
        If the backend stops, product pages, cart, and checkout stop. Payments that already reached
        the bank can still be confirmed when the backend is back. There is no second server waiting.
        The process manager starts a crashed process again on its own.
      </p>

      {error ? (
        <div style={{ ...card, borderColor: "#e7b3b3", color: "#8a1f1f" }}>{error}</div>
      ) : null}
      {loading && !data ? <div style={card}>Reading the server…</div> : null}

      {t ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
            <Stat label="People today" value={t.people == null ? "—" : String(t.people)} hint="Distinct shopper addresses" />
            <Stat
              label="Checked the storefront"
              value={t.storefrontPeople == null ? "—" : String(t.storefrontPeople)}
              hint={`${t.storefrontPageLoads.toLocaleString("en-IN")} page loads`}
            />
            <Stat
              label="Shoppers who hit a missing page"
              value={t.shopperFailedPeople == null ? String(t.shopperHtml404) : String(t.shopperFailedPeople)}
              hint={`${t.shopperHtml404.toLocaleString("en-IN")} missing pages`}
            />
            <Stat label="Server failures" value={String(t.serverErrors)} hint="500–504 responses today" />
            <Stat label="Scanner probes" value={t.scanner404.toLocaleString("en-IN")} hint="Old WordPress and bots, ignored above" />
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: "#6b6258" }}>{t.note}</p>

          {t.topShopper404.length > 0 ? (
            <div style={card}>
              <p style={{ margin: "0 0 10px", fontWeight: 700, color: "#1e3a2f" }}>Missing pages shoppers opened</p>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "14px" }}>
                {t.topShopper404.map((row) => (
                  <li key={row.path}>
                    {row.count} × {row.path}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {data ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
          {data.processes.map((proc) => (
            <div key={proc.name} style={card}>
              <p style={{ margin: 0, fontWeight: 700, color: "#1e3a2f" }}>{processLabel(proc.name)}</p>
              <p style={{ margin: "8px 0 0", fontSize: "14px" }}>
                Status: <strong>{proc.status}</strong>
                {proc.pid ? ` · pid ${proc.pid}` : ""}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#5c5348" }}>
                CPU {proc.cpuPercent == null ? "—" : `${proc.cpuPercent}%`} · memory{" "}
                {proc.memoryMb == null ? "—" : `${proc.memoryMb} MB`} · up {formatUptime(proc.uptimeSeconds)} · restarts{" "}
                {proc.restarts ?? "—"}
              </p>
            </div>
          ))}
          <div style={card}>
            <p style={{ margin: 0, fontWeight: 700, color: "#1e3a2f" }}>Health</p>
            <p style={{ margin: "8px 0 0", fontSize: "14px" }}>
              Overall: <strong>{data.health.status}</strong>
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#5c5348" }}>
              Database {data.health.database} · Redis {data.health.redis}
            </p>
          </div>
          <div style={card}>
            <p style={{ margin: 0, fontWeight: 700, color: "#1e3a2f" }}>Machine</p>
            <p style={{ margin: "8px 0 0", fontSize: "14px" }}>
              CPU {data.machine.cpuPercent == null ? "—" : `${data.machine.cpuPercent}%`}
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#5c5348" }}>
              Load {data.machine.load1} (1 min) · {data.machine.load5} (5 min)
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#5c5348" }}>
              Memory {data.machine.memoryUsedMb} / {data.machine.memoryTotalMb} MB
            </p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void load()}
        style={{
          justifySelf: "start",
          background: "#1e3a2f",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          padding: "8px 14px",
          cursor: "pointer"
        }}
      >
        Refresh
      </button>
    </div>
  );
}
