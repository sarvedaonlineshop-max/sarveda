import fs from "fs";
import path from "path";

import { logger } from "../../config/logger";

export type WooDumpProductRow = {
  sku: string;
  productName: string;
  slug: string;
  unitsSold: number;
  revenueInr: number;
  revenueInPaise: number;
  lineRows?: number;
};

export type WooDumpAnalytics = {
  source: string;
  dumpFile: string;
  period: {
    label: string;
    from: string;
    to: string;
    timezoneNote?: string;
  };
  generatedAt: string;
  note: string;
  rules: {
    mostSold: string;
    leastSold: string;
    purchaseOrderNeeded: string;
    dropCandidates: string;
  };
  mostSoldThisMonth: WooDumpProductRow[];
  leastSoldThisMonth: WooDumpProductRow[];
  purchaseOrderNeeded: WooDumpProductRow[];
  dropCandidates: WooDumpProductRow[];
  allTimeTopItems: WooDumpProductRow[];
  counts: {
    mostSoldThisMonth: number;
    leastSoldThisMonth: number;
    purchaseOrderNeeded: number;
    dropCandidates: number;
    allTimeTopItems: number;
  };
};

const EMPTY: WooDumpAnalytics = {
  source: "woo-mysql-dump-snapshot",
  dumpFile: "",
  period: { label: "—", from: "", to: "" },
  generatedAt: "",
  note: "Woo dump analytics file missing on server.",
  rules: {
    mostSold: "",
    leastSold: "",
    purchaseOrderNeeded: "",
    dropCandidates: ""
  },
  mostSoldThisMonth: [],
  leastSoldThisMonth: [],
  purchaseOrderNeeded: [],
  dropCandidates: [],
  allTimeTopItems: [],
  counts: {
    mostSoldThisMonth: 0,
    leastSoldThisMonth: 0,
    purchaseOrderNeeded: 0,
    dropCandidates: 0,
    allTimeTopItems: 0
  }
};

function withCounts(raw: Partial<WooDumpAnalytics>): WooDumpAnalytics {
  const mostSoldThisMonth = Array.isArray(raw.mostSoldThisMonth) ? raw.mostSoldThisMonth : [];
  const leastSoldThisMonth = Array.isArray(raw.leastSoldThisMonth) ? raw.leastSoldThisMonth : [];
  const purchaseOrderNeeded = Array.isArray(raw.purchaseOrderNeeded) ? raw.purchaseOrderNeeded : [];
  const dropCandidates = Array.isArray(raw.dropCandidates) ? raw.dropCandidates : [];
  const allTimeTopItems = Array.isArray(raw.allTimeTopItems) ? raw.allTimeTopItems : [];
  return {
    source: raw.source ?? EMPTY.source,
    dumpFile: raw.dumpFile ?? "",
    period: raw.period ?? EMPTY.period,
    generatedAt: raw.generatedAt ?? "",
    note: raw.note ?? "",
    rules: {
      mostSold: raw.rules?.mostSold ?? "",
      leastSold: raw.rules?.leastSold ?? "",
      purchaseOrderNeeded: raw.rules?.purchaseOrderNeeded ?? "",
      dropCandidates: raw.rules?.dropCandidates ?? ""
    },
    mostSoldThisMonth,
    leastSoldThisMonth,
    purchaseOrderNeeded,
    dropCandidates,
    allTimeTopItems,
    counts: {
      mostSoldThisMonth: mostSoldThisMonth.length,
      leastSoldThisMonth: leastSoldThisMonth.length,
      purchaseOrderNeeded: purchaseOrderNeeded.length,
      dropCandidates: dropCandidates.length,
      allTimeTopItems: allTimeTopItems.length
    }
  };
}

export function loadWooDumpAnalytics(): WooDumpAnalytics {
  const candidates = [
    path.join(process.cwd(), "data", "woo-dump-analytics.json"),
    path.join(__dirname, "..", "..", "..", "data", "woo-dump-analytics.json")
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<WooDumpAnalytics>;
      return withCounts(raw);
    } catch (err) {
      logger.warn("Failed reading woo dump analytics file", {
        file,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  return EMPTY;
}

export function dashboardInsightsFromWooDump(analytics: WooDumpAnalytics = loadWooDumpAnalytics()) {
  const mostSoldTop5 = analytics.mostSoldThisMonth.slice(0, 5).map((r) => ({
    sku: r.sku,
    name: r.productName,
    unitsSold: r.unitsSold
  }));
  const tips: string[] = [];
  if (mostSoldTop5[0]) {
    tips.push(
      `${mostSoldTop5[0].name} leads ${analytics.period.label} sales (${mostSoldTop5[0].unitsSold} units) — keep buffer stock.`
    );
  }
  if (analytics.counts.purchaseOrderNeeded > 0) {
    tips.push(
      `${analytics.counts.purchaseOrderNeeded} SKU(s) need a purchase order (sold ≥5 units in ${analytics.period.label}).`
    );
  }
  if (analytics.counts.dropCandidates > 0) {
    tips.push(
      `${analytics.counts.dropCandidates} slow SKU(s) are drop candidates (1–2 units Apr–Jul 2026).`
    );
  }
  if (tips.length === 0) {
    tips.push("Woo dump analytics file is empty or missing — regenerate from the latest dump snapshot.");
  }
  return {
    source: "woo-dump" as const,
    periodLabel: analytics.period.label,
    mostSoldThisMonthTop5: mostSoldTop5,
    purchaseOrderNeededCount: analytics.counts.purchaseOrderNeeded,
    dropCandidatesCount: analytics.counts.dropCandidates,
    leastSoldThisMonthCount: analytics.counts.leastSoldThisMonth,
    tips,
    /** @deprecated kept empty for older clients */
    fastMovers: [] as Array<{ productId: string; name: string; unitsSold: number }>,
    /** @deprecated kept empty for older clients */
    slowMovers: [] as Array<{ productId: string; name: string; unitsSold: number }>
  };
}
