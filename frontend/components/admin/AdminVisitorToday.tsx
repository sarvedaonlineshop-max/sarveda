"use client";

import { useEffect, useState } from "react";

import { fetchVisitorDetail, fetchVisitorToday, type ServersDetail, type VisitorToday } from "@/lib/admin-servers";

const card: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  padding: "20px 22px",
  textAlign: "left",
  width: "100%",
  cursor: "pointer"
};

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

type OpenView = "people" | "storefront";

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

function CountryBars({ rows }: { rows: Array<{ country: string }> }) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.country || "Unknown", (counts.get(row.country || "Unknown") ?? 0) + 1);
  const bars = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: "1px solid #e4d9c8",
        background: active ? "#1e3a2f" : "#fff",
        color: active ? "#fffdf8" : "#1e3a2f",
        borderRadius: "999px",
        padding: "6px 12px",
        cursor: "pointer",
        fontSize: "13px"
      }}
    >
      {label}
    </button>
  );
}

function PeopleTable({ rows }: { rows: Extract<ServersDetail, { view: "people" }>["people"] }) {
  return (
    <>
      <p style={{ margin: "0 0 12px", fontWeight: 700, color: "#1e3a2f" }}>People today, by country</p>
      {rows.length === 0 ? <p style={{ margin: 0 }}>No visitor addresses recorded yet today.</p> : <CountryBars rows={rows} />}
      <div style={{ overflow: "auto", maxHeight: 520 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={th}>IP address</th>
            <th style={th}>Country</th>
            <th style={th}>Source UTM</th>
            <th style={th}>Pages checked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ip}>
              <td style={td}>{row.ip}</td>
              <td style={td}>{row.country}</td>
              <td style={td}>{row.utm ?? "—"}</td>
              <td style={td}>{row.pages.length > 0 ? row.pages.join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function StorefrontTable({ rows }: { rows: Extract<ServersDetail, { view: "storefront" }>["storefront"] }) {
  const [audience, setAudience] = useState<"human" | "bot">("human");
  const [stage, setStage] = useState<"all" | "cart" | "checkout" | "bought">("all");
  const humans = rows.filter((row) => row.audience === "human");
  const bots = rows.filter((row) => row.audience === "bot");
  const group = audience === "human" ? humans : bots;
  const stageCount = {
    all: group.length,
    cart: group.filter((row) => row.addedToCart).length,
    checkout: group.filter((row) => row.checkout).length,
    bought: group.filter((row) => row.bought).length
  };
  const shown = group.filter((row) => {
    if (stage === "cart") return row.addedToCart;
    if (stage === "checkout") return row.checkout;
    if (stage === "bought") return row.bought;
    return true;
  });

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <Pill label={`Humans (${humans.length})`} active={audience === "human"} onClick={() => setAudience("human")} />
        <Pill label={`Bots (${bots.length})`} active={audience === "bot"} onClick={() => setAudience("bot")} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
        <Pill label={`All (${stageCount.all})`} active={stage === "all"} onClick={() => setStage("all")} />
        <Pill label={`Added to cart (${stageCount.cart})`} active={stage === "cart"} onClick={() => setStage("cart")} />
        <Pill label={`Till checkout (${stageCount.checkout})`} active={stage === "checkout"} onClick={() => setStage("checkout")} />
        <Pill label={`Bought (${stageCount.bought})`} active={stage === "bought"} onClick={() => setStage("bought")} />
      </div>
      <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#6b6258" }}>
        A bot opened many products a few seconds apart, or browsed with a browser name catalog crawlers use. Someone who
        completed an order stays under Humans.
      </p>
    <div style={{ overflow: "auto", maxHeight: 520 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={th}>IP address</th>
            <th style={th}>Place</th>
            <th style={th}>Source UTM</th>
            <th style={th}>Timing</th>
            <th style={th}>Pages loaded</th>
            <th style={th}>Product checked</th>
            <th style={th}>Added to cart</th>
            <th style={th}>Checkout</th>
            <th style={th}>Bought</th>
            <th style={th}>Note</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.ip}>
              <td style={td}>{row.ip}</td>
              <td style={td}>{row.place || row.country}</td>
              <td style={td}>{row.utm ?? "—"}</td>
              <td style={td}>
                {formatWhen(row.firstAt)}
                {row.lastAt !== row.firstAt ? ` – ${formatWhen(row.lastAt)}` : ""}
              </td>
              <td style={td}>{(row.pages ?? []).length > 0 ? (row.pages ?? []).join(", ") : "—"}</td>
              <td style={td}>
                {row.productCount === 0
                  ? "—"
                  : `${row.products.join(", ")}${row.productCount > row.products.length ? ` +${row.productCount - row.products.length} more` : ""}`}
              </td>
              <td style={td}>{(row.cartProducts ?? []).length > 0 ? (row.cartProducts ?? []).join(", ") : yesNo(row.addedToCart)}</td>
              <td style={td}>
                {row.checkout ? ((row.cartProducts ?? []).length > 0 ? (row.cartProducts ?? []).join(", ") : "Opened checkout") : "No"}
              </td>
              <td style={td}>{yesNo(row.bought)}</td>
              <td style={td}>{row.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

export function AdminVisitorToday() {
  const [data, setData] = useState<VisitorToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenView | null>(null);
  const [detail, setDetail] = useState<ServersDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchVisitorToday()
      .then((row) => {
        if (!cancelled) setData(row);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load visitor counts");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(view: OpenView) {
    if (open === view) {
      setOpen(null);
      return;
    }
    setOpen(view);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void fetchVisitorDetail(view)
      .then((row) => {
        setDetail(row);
        setDetailLoading(false);
      })
      .catch((err: unknown) => {
        setDetailError(err instanceof Error ? err.message : "Could not load the list");
        setDetailLoading(false);
      });
  }

  if (error) {
    return <p style={{ margin: 0, color: "#8a1f1f" }}>{error}</p>;
  }
  if (!data) {
    return <p style={{ margin: 0, color: "var(--admin-text-muted, #8a7060)" }}>Reading today’s visitors…</p>;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
        <button type="button" onClick={() => toggle("people")} style={{ ...card, borderColor: open === "people" ? "#1e3a2f" : undefined }}>
          <p style={{ margin: 0, fontSize: "12px", letterSpacing: "0.04em", color: "var(--admin-text-muted, #8a7060)", fontWeight: 700 }}>
            PEOPLE TODAY
          </p>
          <p style={{ margin: "10px 0 0", fontSize: "32px", lineHeight: 1.1, fontWeight: 800, color: "#1e3a2f" }}>
            {data.people == null ? "—" : data.people.toLocaleString("en-IN")}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--admin-text-muted, #8a7060)" }}>Distinct shopper addresses</p>
        </button>
        <button type="button" onClick={() => toggle("storefront")} style={{ ...card, borderColor: open === "storefront" ? "#1e3a2f" : undefined }}>
          <p style={{ margin: 0, fontSize: "12px", letterSpacing: "0.04em", color: "var(--admin-text-muted, #8a7060)", fontWeight: 700 }}>
            CHECKED THE STOREFRONT
          </p>
          <p style={{ margin: "10px 0 0", fontSize: "32px", lineHeight: 1.1, fontWeight: 800, color: "#1e3a2f" }}>
            {data.storefrontPeople == null ? "—" : data.storefrontPeople.toLocaleString("en-IN")}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--admin-text-muted, #8a7060)" }}>
            {data.storefrontPageLoads.toLocaleString("en-IN")} page loads
          </p>
        </button>
      </div>
      {open ? (
        <div style={{ ...card, cursor: "default" }}>
          {detailLoading ? <p style={{ margin: 0 }}>Reading the list…</p> : null}
          {detailError ? <p style={{ margin: 0, color: "#8a1f1f" }}>{detailError}</p> : null}
          {detail?.view === "people" ? <PeopleTable rows={detail.people} /> : null}
          {detail?.view === "storefront" ? <StorefrontTable rows={detail.storefront} /> : null}
        </div>
      ) : null}
    </div>
  );
}
