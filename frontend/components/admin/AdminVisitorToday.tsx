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

function PeopleTable({ rows }: { rows: Extract<ServersDetail, { view: "people" }>["people"] }) {
  return (
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
  );
}

function StorefrontTable({ rows }: { rows: Extract<ServersDetail, { view: "storefront" }>["storefront"] }) {
  return (
    <div style={{ overflow: "auto", maxHeight: 520 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={th}>IP address</th>
            <th style={th}>Place</th>
            <th style={th}>Source UTM</th>
            <th style={th}>Timing</th>
            <th style={th}>Product checked</th>
            <th style={th}>Added to cart</th>
            <th style={th}>Checkout</th>
            <th style={th}>Bought</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ip}>
              <td style={td}>{row.ip}</td>
              <td style={td}>{row.place || row.country}</td>
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
              <td style={td}>{(row.cartProducts ?? []).length > 0 ? (row.cartProducts ?? []).join(", ") : yesNo(row.addedToCart)}</td>
              <td style={td}>
                {row.checkout ? ((row.cartProducts ?? []).length > 0 ? (row.cartProducts ?? []).join(", ") : "Opened checkout") : "No"}
              </td>
              <td style={td}>{yesNo(row.bought)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
