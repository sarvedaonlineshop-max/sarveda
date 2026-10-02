"use client";

import { useEffect, useState } from "react";

import { fetchVisitorToday, type VisitorToday } from "@/lib/admin-servers";

const card: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  padding: "20px 22px"
};

function Count({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={card}>
      <p style={{ margin: 0, fontSize: "12px", letterSpacing: "0.04em", color: "var(--admin-text-muted, #8a7060)", fontWeight: 700 }}>
        {label}
      </p>
      <p style={{ margin: "10px 0 0", fontSize: "32px", lineHeight: 1.1, fontWeight: 800, color: "#1e3a2f" }}>{value}</p>
      <p style={{ margin: "8px 0 0", fontSize: "13px", color: "var(--admin-text-muted, #8a7060)" }}>{hint}</p>
    </div>
  );
}

export function AdminVisitorToday() {
  const [data, setData] = useState<VisitorToday | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
    return <p style={{ margin: 0, color: "#8a1f1f" }}>{error}</p>;
  }
  if (!data) {
    return <p style={{ margin: 0, color: "var(--admin-text-muted, #8a7060)" }}>Reading today’s visitors…</p>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
      <Count
        label="PEOPLE TODAY"
        value={data.people == null ? "—" : data.people.toLocaleString("en-IN")}
        hint="Distinct shopper addresses"
      />
      <Count
        label="CHECKED THE STOREFRONT"
        value={data.storefrontPeople == null ? "—" : data.storefrontPeople.toLocaleString("en-IN")}
        hint={`${data.storefrontPageLoads.toLocaleString("en-IN")} page loads`}
      />
    </div>
  );
}
