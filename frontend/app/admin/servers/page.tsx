"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Server } from "lucide-react";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";
import { useAdminUser } from "@/components/admin/AdminUserContext";
import { AdminApiError } from "@/lib/admin-errors";
import { fetchServersDetail, fetchServersSnapshot, type ServersDetail, type ServersSnapshot } from "@/lib/admin-servers";
import { isServersDashboardEmail } from "@/lib/servers-access";

const card: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  padding: "18px 20px"
};

type DetailView = "people" | "storefront" | "missing" | "outages";

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function processLabel(name: string): string {
  if (name === "sarveda-frontend-preview") return "Frontend (shop and admin)";
  if (name === "sarveda-backend") return "Backend (API)";
  return name;
}

function Stat({
  label,
  value,
  hint,
  active,
  onClick
}: {
  label: string;
  value: string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p style={{ margin: 0, fontSize: "13px", letterSpacing: "0.04em", textTransform: "uppercase", color: "#8a7060" }}>
        {label}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: "28px", fontWeight: 700, color: "#1e3a2f" }}>{value}</p>
      {hint ? <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#6b6258" }}>{hint}</p> : null}
    </>
  );
  if (!onClick) return <div style={card}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...card,
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
        borderColor: active ? "#1e3a2f" : "var(--admin-card-border, #e8e2d9)",
        boxShadow: active ? "inset 0 0 0 1px #1e3a2f" : "none"
      }}
    >
      {body}
    </button>
  );
}

function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflow: "auto", maxHeight: 520 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>{children}</table>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #e8e2d9",
  position: "sticky",
  top: 0,
  background: "#fff",
  color: "#5c5348"
};

const td: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f0ebe4",
  verticalAlign: "top",
  color: "#1e3a2f"
};

function CountryBars({ rows }: { rows: Array<{ country: string }> }) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.country || "Unknown", (counts.get(row.country || "Unknown") ?? 0) + 1);
  const bars = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = bars[0]?.[1] ?? 1;
  return (
    <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
      {bars.map(([country, count]) => (
        <div key={country} style={{ display: "grid", gridTemplateColumns: "140px 1fr 48px", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "#3d342c" }}>{country}</span>
          <span style={{ display: "block", height: "14px", background: "#f3efe8", borderRadius: "7px" }}>
            <span
              style={{
                display: "block",
                height: "14px",
                width: `${Math.max(4, Math.round((count / max) * 100))}%`,
                background: "#1e3a2f",
                borderRadius: "7px"
              }}
            />
          </span>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a2f" }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({ detail }: { detail: ServersDetail }) {
  if (detail.view === "people") {
    return (
      <>
        <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#1e3a2f" }}>People today, by country</p>
        {detail.people.length === 0 ? <p style={{ margin: 0 }}>No visitor addresses recorded yet today.</p> : <CountryBars rows={detail.people} />}
        <TableWrap>
          <thead>
            <tr>
              <th style={th}>IP address</th>
              <th style={th}>Country</th>
              <th style={th}>Source UTM</th>
              <th style={th}>Pages checked</th>
            </tr>
          </thead>
          <tbody>
            {detail.people.map((row) => (
              <tr key={row.ip}>
                <td style={td}>{row.ip}</td>
                <td style={td}>{row.country}</td>
                <td style={td}>{row.utm ?? "—"}</td>
                <td style={td}>{row.pages.length > 0 ? row.pages.join(", ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </>
    );
  }

  if (detail.view === "storefront") {
    return (
      <>
        <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#1e3a2f" }}>Checked the storefront</p>
        <TableWrap>
          <thead>
            <tr>
              <th style={th}>IP address</th>
              <th style={th}>Source UTM</th>
              <th style={th}>Timing</th>
              <th style={th}>Product checked</th>
              <th style={th}>Added to cart</th>
              <th style={th}>Checkout</th>
              <th style={th}>Bought</th>
            </tr>
          </thead>
          <tbody>
            {detail.storefront.map((row) => (
              <tr key={row.ip}>
                <td style={td}>{row.ip}</td>
                <td style={td}>{row.utm ?? "—"}</td>
                <td style={td}>
                  {formatWhen(row.firstAt)}
                  {row.lastAt !== row.firstAt ? ` – ${formatWhen(row.lastAt)}` : ""}
                </td>
                <td style={td}>
                  {row.productCount === 0
                    ? "—"
                    : `${row.products.join(", ")}${row.productCount > row.products.length ? ` +${row.productCount - row.products.length} more` : ""}`}
                </td>
                <td style={td}>{yesNo(row.addedToCart)}</td>
                <td style={td}>{yesNo(row.checkout)}</td>
                <td style={td}>{yesNo(row.bought)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </>
    );
  }

  if (detail.view === "missing") {
    return (
      <>
        <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#1e3a2f" }}>Missing pages</p>
        <TableWrap>
          <thead>
            <tr>
              <th style={th}>Page missing</th>
              <th style={th}>Source UTM</th>
              <th style={th}>Timing</th>
            </tr>
          </thead>
          <tbody>
            {detail.missing.map((row, index) => (
              <tr key={`${row.at}-${row.path}-${index}`}>
                <td style={td}>{row.path}</td>
                <td style={td}>{row.utm ?? "—"}</td>
                <td style={td}>{formatWhen(row.at)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </>
    );
  }

  return (
    <>
      <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#1e3a2f" }}>Shop was unreachable</p>
      {detail.outages.length === 0 ? (
        <p style={{ margin: 0 }}>The shop and the API answered all day.</p>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <th style={th}>From</th>
              <th style={th}>To</th>
              <th style={th}>Requests that failed</th>
              <th style={th}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {detail.outages.map((row) => (
              <tr key={row.from}>
                <td style={td}>{formatWhen(row.from)}</td>
                <td style={td}>{formatWhen(row.to)}</td>
                <td style={td}>{row.requests}</td>
                <td style={td}>{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}

export default function AdminServersPage() {
  const user = useAdminUser();
  const allowed = isServersDashboardEmail(user?.email);
  const [data, setData] = useState<ServersSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(allowed);
  const [view, setView] = useState<DetailView | null>(null);
  const [detail, setDetail] = useState<ServersDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const openView = useCallback(async (next: DetailView) => {
    setView(next);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchServersDetail(next));
    } catch (err) {
      setDetailError(err instanceof AdminApiError ? err.message : "Could not load this detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

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
      {error ? (
        <div style={{ ...card, borderColor: "#e7b3b3", color: "#8a1f1f" }}>{error}</div>
      ) : null}
      {loading && !data ? <div style={card}>Reading the server…</div> : null}

      {t ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <Stat
            label="People today"
            value={t.people == null ? "—" : String(t.people)}
            hint="Distinct shopper addresses"
            active={view === "people"}
            onClick={() => void openView("people")}
          />
          <Stat
            label="Checked the storefront"
            value={t.storefrontPeople == null ? "—" : String(t.storefrontPeople)}
            hint={`${t.storefrontPageLoads.toLocaleString("en-IN")} page loads`}
            active={view === "storefront"}
            onClick={() => void openView("storefront")}
          />
          <Stat
            label="Shoppers who hit a missing page"
            value={t.shopperFailedPeople == null ? String(t.shopperHtml404) : String(t.shopperFailedPeople)}
            hint={`${t.shopperHtml404.toLocaleString("en-IN")} missing pages`}
            active={view === "missing"}
            onClick={() => void openView("missing")}
          />
          <Stat
            label="Shop was unreachable"
            value={String(t.serverErrors)}
            hint={`${t.shopOutages} stop${t.shopOutages === 1 ? "" : "s"} today. Picture errors are not counted.`}
            active={view === "outages"}
            onClick={() => void openView("outages")}
          />
          <Stat label="Scanner probes" value={t.scanner404.toLocaleString("en-IN")} hint="Old WordPress and bots, ignored above" />
        </div>
      ) : null}

      {view ? (
        <div style={card}>
          {detailLoading ? <p style={{ margin: 0 }}>Reading the log…</p> : null}
          {detailError ? <p style={{ margin: 0, color: "#8a1f1f" }}>{detailError}</p> : null}
          {detail && detail.view === view ? <DetailPanel detail={detail} /> : null}
        </div>
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
