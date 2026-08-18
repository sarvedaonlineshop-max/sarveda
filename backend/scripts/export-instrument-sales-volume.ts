/**
 * Sales volume for a procurement list, from ZohoHistoricalInvoice (~12.5k invoices).
 *
 *   cd backend && npx tsx scripts/export-instrument-sales-volume.ts
 *
 * Writes: ../data/instrument-sales-volume-zoho.xlsx
 */
import path from "path";
import dotenv from "dotenv";
import ExcelJS from "exceljs";

import { PrismaClient } from "@prisma/client";
import { reportingInrPaiseFromMinor } from "../src/modules/zoho/zoho-historical-invoices.service";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient({ log: ["error"] });

const OUT = path.resolve(__dirname, "../../data/instrument-sales-volume-zoho.xlsx");
const EXCLUDED_STATUSES = new Set(["void", "draft"]);

type FamilyId =
  | "pangi"
  | "kenari"
  | "asalato"
  | "asalato-painted"
  | "rainstick"
  | "shamanic-drum"
  | "ocean-drum"
  | "kenari-bracelet"
  | "egg-shaker"
  | "wooden-shaker-painted"
  | "wooden-shaker-plain"
  | "den-den-daiko"
  | "didgeridoo"
  | "tambourine"
  | "caxixi";

const FAMILIES: { id: FamilyId; label: string; notes: string }[] = [
  { id: "pangi", label: "Pangi", notes: "Pangi seed shaker / seed-shell rattle" },
  { id: "kenari", label: "Kenari", notes: "Kenari seed / seed-shell shakers (excludes bracelet & chimes)" },
  { id: "asalato", label: "Asalato", notes: "Asalato / Aslatau / Kashaka — unpainted / plain" },
  { id: "asalato-painted", label: "Asalato painted", notes: "Asalato / Aslatau / Kashaka — painted" },
  { id: "rainstick", label: "Rainstick — all sizes", notes: "Bamboo rainstick 40 / 60 / 80 cm / 1 m" },
  { id: "shamanic-drum", label: "Shamanic Drum — all variants", notes: "Plain / Butterfly / Tree of Life; excludes bags" },
  { id: "ocean-drum", label: "Ocean Drum — all variants", notes: "Plain / Design / Dream Catcher / Flower of Life; excludes bags" },
  { id: "kenari-bracelet", label: "Kenari bracelet", notes: "Kenari seed bracelet only" },
  { id: "egg-shaker", label: "Egg shaker", notes: "Plain, painted/dotted, with handle" },
  { id: "wooden-shaker-painted", label: "Wooden shaker painted", notes: "Wooden maracas — dotted / painted / abstract (not coconut)" },
  { id: "wooden-shaker-plain", label: "Wooden shaker plain", notes: "Wooden maracas — plain (not coconut)" },
  { id: "den-den-daiko", label: "Den den Daiko", notes: "Spin / twist drum" },
  { id: "didgeridoo", label: "Didgeridoo", notes: "S-shaped and spiral/snake, all colours" },
  { id: "tambourine", label: "Tambourine", notes: "Circular and half-moon wooden tambourines" },
  { id: "caxixi", label: "Caxixi", notes: "Caxixi / medium natural" }
];

const TEAL = "1C352A";
const GOLD = "B98A3E";
const CREAM = "FAF5EC";

function looksLikeAsin(value: string): boolean {
  return /^B0[A-Z0-9]{8,}$/i.test(value.trim());
}

function skuCandidates(name: string, sku: string): string[] {
  const out: string[] = [];
  if (sku) out.push(sku.toUpperCase());
  const nameSku = name.trim().toUpperCase();
  if (/^[A-Z]{2}[-_][A-Z0-9._-]+$/.test(nameSku)) out.push(nameSku);
  return out;
}

function isAsalato(blob: string): boolean {
  return /\b(asalato|aslatua|aslatu|aslatau|kashaka)\b/.test(blob);
}

/** Match on Zoho item name + SKU only — item descriptions list related products and pollute keywords. */
function classify(name: string, sku: string): FamilyId | null {
  const n = name.trim();
  const skuU = sku.trim().toUpperCase();
  const blob = `${n} ${skuU}`.toLowerCase();
  const skus = skuCandidates(n, skuU);

  if (!n && !skuU) return null;
  if (looksLikeAsin(n) && !skuU) return null;
  if (n.toLowerCase() === "unnamed") return null;
  if (blob.includes(" bag") || blob.endsWith("bag") || blob.includes("drum bag")) return null;
  if (blob.includes("kenari chime") || skus.some((s) => s.startsWith("MI-KR-CH"))) return null;
  if (blob.includes("coconut maracas") || skus.some((s) => s.startsWith("MI-CM"))) return null;

  if (blob.includes("pangi") || skus.some((s) => s === "MI-PS" || s.startsWith("MI-PS-") || s.startsWith("MI-PSR"))) {
    return "pangi";
  }

  if (
    (blob.includes("kenari") && (blob.includes("bracelet") || blob.includes("bracelt"))) ||
    skus.some((s) => s === "MI-KR-BT")
  ) {
    return "kenari-bracelet";
  }

  if (
    blob.includes("kenari") ||
    skus.some((s) => s.startsWith("MI-KR-S") || s.startsWith("MI-KR-L") || s === "MI-KR-H" || s.startsWith("MI-KR-H-"))
  ) {
    if (blob.includes("chime")) return null;
    return "kenari";
  }

  if (isAsalato(blob) || skus.some((s) => s === "MI-AS" || s.startsWith("MI-AS-"))) {
    const variant = (n.split(" - ").pop() || n).toLowerCase();
    if (variant.includes("paint") || skus.some((s) => s.startsWith("MI-AS-P"))) return "asalato-painted";
    return "asalato";
  }

  if (
    blob.includes("rainstick") ||
    blob.includes("rain stick") ||
    skus.some((s) => s.startsWith("MI-RS") || s === "MI-BR-N")
  ) {
    return "rainstick";
  }

  if (blob.includes("shamanic drum") || skus.some((s) => s.startsWith("MI-SD") || s.startsWith("MS-D"))) {
    return "shamanic-drum";
  }

  if (blob.includes("ocean drum") || skus.some((s) => s.startsWith("MI-OD"))) {
    return "ocean-drum";
  }

  if (blob.includes("egg shaker") || skus.some((s) => s.startsWith("MI-ES"))) {
    return "egg-shaker";
  }

  const wooden =
    blob.includes("wooden maracas") ||
    blob.includes("wooden shaker") ||
    skus.some((s) => s === "MI-WM" || s.startsWith("MI-WM-"));
  if (wooden) {
    const variant = (n.split(" - ").pop() || n).toLowerCase();
    if (
      skus.some((s) => s.startsWith("MI-WM-P")) ||
      variant.includes("dot painted") ||
      variant.includes("dotted") ||
      variant.includes("abstract") ||
      (variant.includes("paint") && !variant.includes("plain"))
    ) {
      return "wooden-shaker-painted";
    }
    return "wooden-shaker-plain";
  }

  if (
    /den\s*den/.test(blob) ||
    /spin\s*\/\s*twist\s*drum/.test(blob) ||
    skus.some((s) => s === "MI-TWD" || s.startsWith("MI-TWD-") || s === "MI-TD-YY")
  ) {
    return "den-den-daiko";
  }

  if (
    blob.includes("didgeridoo") ||
    blob.includes("digeredoo") ||
    blob.includes("digeridoo") ||
    skus.some((s) => s.startsWith("MI-DG"))
  ) {
    return "didgeridoo";
  }

  if (blob.includes("tambourine") || skus.some((s) => s.startsWith("MI-T-"))) {
    return "tambourine";
  }

  if (blob.includes("caxixi") || skus.some((s) => s.startsWith("MI-CX"))) {
    return "caxixi";
  }

  return null;
}

type Acc = {
  family: FamilyId;
  itemName: string;
  sku: string;
  unitsAll: number;
  units12m: number;
  units90d: number;
  invoices: Set<string>;
  revenueInrPaise: number;
  lastSold: Date | null;
  channels: Map<string, number>;
};

function inr(paise: number): number {
  return Math.round(paise) / 100;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 22;
}

async function main() {
  const now = new Date();
  const d12 = new Date(now);
  d12.setUTCDate(d12.getUTCDate() - 365);
  const d90 = new Date(now);
  d90.setUTCDate(d90.getUTCDate() - 90);

  const invoices = await prisma.zohoHistoricalInvoice.findMany({
    where: { status: { notIn: [...EXCLUDED_STATUSES] } },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      currency: true,
      channelNormalized: true,
      status: true,
      lines: {
        select: {
          itemName: true,
          sku: true,
          quantity: true,
          lineTotalInMinor: true
        }
      }
    }
  });

  const byKey = new Map<string, Acc>();
  const years = new Set<number>();
  const yearFamily = new Map<string, number>();
  let matchedLines = 0;
  let matchedUnits = 0;

  for (const inv of invoices) {
    const y = inv.invoiceDate.getUTCFullYear();
    years.add(y);
    for (const line of inv.lines) {
      const name = (line.itemName || "").trim();
      const sku = (line.sku || "").trim();
      const family = classify(name, sku);
      if (!family) continue;
      const qty = Number(line.quantity) || 0;
      if (qty === 0) continue;
      matchedLines += 1;
      matchedUnits += qty;
      const key = `${family}|${name}|${sku || "—"}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = {
          family,
          itemName: name || sku || "Unnamed",
          sku: sku || "—",
          unitsAll: 0,
          units12m: 0,
          units90d: 0,
          invoices: new Set(),
          revenueInrPaise: 0,
          lastSold: null,
          channels: new Map()
        };
        byKey.set(key, acc);
      }
      acc.unitsAll += qty;
      if (inv.invoiceDate >= d12) acc.units12m += qty;
      if (inv.invoiceDate >= d90) acc.units90d += qty;
      acc.invoices.add(inv.id);
      acc.revenueInrPaise += reportingInrPaiseFromMinor(inv.currency, line.lineTotalInMinor);
      if (!acc.lastSold || inv.invoiceDate > acc.lastSold) acc.lastSold = inv.invoiceDate;
      acc.channels.set(inv.channelNormalized, (acc.channels.get(inv.channelNormalized) || 0) + qty);
      const yk = `${family}|${y}`;
      yearFamily.set(yk, (yearFamily.get(yk) || 0) + qty);
    }
  }

  const skus = [...new Set([...byKey.values()].map((a) => a.sku).filter((s) => s && s !== "—"))];
  const stockRows = await prisma.productVariant.findMany({
    where: { sku: { in: skus } },
    select: {
      sku: true,
      inventory: { select: { onHand: true, reserved: true } },
      productRel: { select: { name: true, slug: true } }
    }
  });
  const stockBySku = new Map(stockRows.map((v) => [v.sku, v]));

  const yearList = [...years].sort();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Sarveda";
  wb.created = now;

  const summary = wb.addWorksheet("Order summary", { views: [{ state: "frozen", ySplit: 4 }] });
  summary.getCell("A1").value = "Instrument sales volume for purchase order";
  summary.getCell("A1").font = { bold: true, size: 16, color: { argb: TEAL }, name: "Calibri" };
  summary.mergeCells("A1:J1");
  summary.getCell("A2").value =
    `Source: Zoho Books historical invoices (${invoices.length.toLocaleString("en-IN")} invoices, void/draft excluded). ` +
    `Window: 1 Apr 2024 – 11 Aug 2026. Generated ${now.toISOString().slice(0, 10)}.`;
  summary.getCell("A2").font = { italic: true, size: 10, color: { argb: "00666666" } };
  summary.mergeCells("A2:J2");

  summary.getRow(4).values = [
    "Instrument",
    "Units — all time",
    "Units — last 12 months",
    "Units — last 90 days",
    "Invoices",
    "Revenue (INR)",
    "Zoho item rows",
    "Last sold",
    "On-hand (matched SKUs)",
    "Matching notes"
  ];
  styleHeader(summary.getRow(4));
  summary.columns = [
    { width: 32 },
    { width: 18 },
    { width: 22 },
    { width: 20 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 22 },
    { width: 55 }
  ];

  let sumAll = 0;
  let sum12 = 0;
  let sum90 = 0;
  let sumRev = 0;

  FAMILIES.forEach((fam, i) => {
    const rows = [...byKey.values()].filter((a) => a.family === fam.id);
    const unitsAll = rows.reduce((s, r) => s + r.unitsAll, 0);
    const units12 = rows.reduce((s, r) => s + r.units12m, 0);
    const units90 = rows.reduce((s, r) => s + r.units90d, 0);
    const invoicesN = new Set(rows.flatMap((r) => [...r.invoices])).size;
    const rev = rows.reduce((s, r) => s + r.revenueInrPaise, 0);
    const last = rows.reduce<Date | null>((d, r) => (!d || (r.lastSold && r.lastSold > d) ? r.lastSold : d), null);
    const seenSku = new Set<string>();
    const onHand = rows.reduce((s, r) => {
      if (!r.sku || r.sku === "—" || seenSku.has(r.sku)) return s;
      seenSku.add(r.sku);
      const st = stockBySku.get(r.sku);
      return s + (st?.inventory?.onHand ?? 0);
    }, 0);
    sumAll += unitsAll;
    sum12 += units12;
    sum90 += units90;
    sumRev += rev;
    const excelRow = summary.addRow([
      fam.label,
      Math.round(unitsAll * 100) / 100,
      Math.round(units12 * 100) / 100,
      Math.round(units90 * 100) / 100,
      invoicesN,
      inr(rev),
      rows.length,
      last ? last.toISOString().slice(0, 10) : "—",
      onHand,
      fam.notes
    ]);
    if (i % 2 === 1) {
      excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
    }
    excelRow.getCell(6).numFmt = '#,##0.00';
    excelRow.getCell(2).numFmt = '#,##0.00';
    excelRow.getCell(3).numFmt = '#,##0.00';
    excelRow.getCell(4).numFmt = '#,##0.00';
  });

  const totalRow = summary.addRow([
    "TOTAL (this list)",
    Math.round(sumAll * 100) / 100,
    Math.round(sum12 * 100) / 100,
    Math.round(sum90 * 100) / 100,
    "",
    inr(sumRev),
    byKey.size,
    "",
    "",
    `${matchedLines.toLocaleString("en-IN")} matched invoice lines`
  ]);
  totalRow.font = { bold: true };
  totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
  totalRow.getCell(6).numFmt = '#,##0.00';

  const variants = wb.addWorksheet("By variant SKU", { views: [{ state: "frozen", ySplit: 1 }] });
  variants.getRow(1).values = [
    "Instrument",
    "Zoho item name",
    "SKU",
    "Units — all time",
    "Units — last 12 months",
    "Units — last 90 days",
    "Invoices",
    "Revenue (INR)",
    "Last sold",
    "On-hand",
    "Reserved",
    "Catalog product"
  ];
  styleHeader(variants.getRow(1));
  variants.columns = [
    { width: 28 },
    { width: 62 },
    { width: 18 },
    { width: 16 },
    { width: 20 },
    { width: 18 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 36 }
  ];

  const labelById = Object.fromEntries(FAMILIES.map((f) => [f.id, f.label])) as Record<FamilyId, string>;
  const ordered = [...byKey.values()].sort((a, b) => {
    const fa = FAMILIES.findIndex((f) => f.id === a.family);
    const fb = FAMILIES.findIndex((f) => f.id === b.family);
    if (fa !== fb) return fa - fb;
    return b.unitsAll - a.unitsAll;
  });

  for (const r of ordered) {
    const st = stockBySku.get(r.sku);
    const row = variants.addRow([
      labelById[r.family],
      r.itemName,
      r.sku,
      Math.round(r.unitsAll * 100) / 100,
      Math.round(r.units12m * 100) / 100,
      Math.round(r.units90d * 100) / 100,
      r.invoices.size,
      inr(r.revenueInrPaise),
      r.lastSold ? r.lastSold.toISOString().slice(0, 10) : "—",
      st?.inventory?.onHand ?? "",
      st?.inventory?.reserved ?? "",
      st?.productRel.name ?? ""
    ]);
    row.getCell(8).numFmt = '#,##0.00';
  }

  const yearly = wb.addWorksheet("Units by year");
  yearly.getRow(1).values = ["Instrument", ...yearList.map(String), "All years"];
  styleHeader(yearly.getRow(1));
  yearly.getColumn(1).width = 32;
  yearList.forEach((_, i) => {
    yearly.getColumn(i + 2).width = 12;
  });
  yearly.getColumn(yearList.length + 2).width = 12;
  for (const fam of FAMILIES) {
    const vals = yearList.map((y) => Math.round((yearFamily.get(`${fam.id}|${y}`) || 0) * 100) / 100);
    const tot = vals.reduce((s, n) => s + n, 0);
    yearly.addRow([fam.label, ...vals, Math.round(tot * 100) / 100]);
  }

  const channels = wb.addWorksheet("Units by channel");
  const channelNames = [...new Set([...byKey.values()].flatMap((r) => [...r.channels.keys()]))].sort();
  channels.getRow(1).values = ["Instrument", ...channelNames, "Total"];
  styleHeader(channels.getRow(1));
  channels.getColumn(1).width = 32;
  for (const fam of FAMILIES) {
    const rows = [...byKey.values()].filter((a) => a.family === fam.id);
    const vals = channelNames.map((ch) =>
      Math.round(rows.reduce((s, r) => s + (r.channels.get(ch) || 0), 0) * 100) / 100
    );
    const tot = vals.reduce((s, n) => s + n, 0);
    channels.addRow([fam.label, ...vals, Math.round(tot * 100) / 100]);
  }

  const notes = wb.addWorksheet("Notes");
  notes.getColumn(1).width = 100;
  notes.getCell("A1").value = "How to read this workbook";
  notes.getCell("A1").font = { bold: true, size: 14, color: { argb: TEAL } };
  const noteLines = [
    "",
    "Data is ZohoHistoricalInvoice + ZohoHistoricalInvoiceLine (the ~12.5k Zoho Books invoices imported for marketplace analytics). Live website Order rows are not used.",
    "Void and draft invoices are excluded. Overdue and closed invoices are included (sold volume).",
    "Lines are matched on Zoho item name + SKU only (not item description — descriptions mention related products and were causing false matches).",
    "Amazon ASIN-only lines (item name like B0…) and blank/Unnamed lines are excluded unless a SKU is present.",
    "Revenue is line total converted to INR with the same reporting FX as the Zoho dashboard (USD≈83, GBP≈105, AED≈22.6, EUR≈90).",
    "Kenari on the summary is seed/shell shakers only. Kenari bracelet is a separate row. Kenari chimes are excluded.",
    "Asalato vs Asalato painted is split on “painted” in the Zoho item name / SKU MI-AS-P. Default Aslatua Kashaka Asalato Shaker (MI-AS) is counted as unpainted.",
    "Shamanic / Ocean drum bags are excluded from the drum rows.",
    "Wooden shaker = wooden maracas. Coconut maracas (MI-CM) are excluded.",
    "Den den Daiko is spin/twist drum only — tongue drums (MI-TD-*) are not included.",
    "On-hand is current catalog stock, counted once per SKU (not once per Zoho item-name spelling). Blank on-hand means the Zoho SKU is not on a live variant.",
    "Last 12 months / 90 days are rolling from today — useful for reorder quantity. All-time is Apr 2024–Aug 2026."
  ];
  noteLines.forEach((t, i) => {
    notes.getCell(`A${i + 2}`).value = t;
    notes.getCell(`A${i + 2}`).alignment = { wrapText: true };
  });

  await wb.xlsx.writeFile(OUT);
  console.log("Wrote", OUT);
  console.log("matched lines", matchedLines, "units", Math.round(matchedUnits), "sku rows", byKey.size);
  for (const fam of FAMILIES) {
    const rows = [...byKey.values()].filter((a) => a.family === fam.id);
    const u = rows.reduce((s, r) => s + r.unitsAll, 0);
    console.log(fam.label.padEnd(34), String(Math.round(u)).padStart(6), "units", String(rows.length).padStart(3), "rows");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
