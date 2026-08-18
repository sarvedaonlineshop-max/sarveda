/**
 * Sales volume for a procurement list, from ZohoHistoricalInvoice (~12.5k invoices).
 *
 *   cd backend && npx tsx scripts/export-instrument-sales-volume.ts
 *
 * Writes: ../data/instrument-sales-volume-zoho.xlsx
 * DO Woo sheets need: ../data/instrument-sales-do-lines.tsv
 *   (from data/compare/dump_do_instrument_order_lines.py on the DO server)
 */
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import ExcelJS from "exceljs";

import { PrismaClient } from "@prisma/client";
import { reportingInrPaiseFromMinor } from "../src/modules/zoho/zoho-historical-invoices.service";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient({ log: ["error"] });

const OUT = path.resolve(__dirname, "../../data/instrument-sales-volume-zoho.xlsx");
const DO_LINES = path.resolve(__dirname, "../../data/instrument-sales-do-lines.tsv");
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
  { id: "asalato", label: "Asalato", notes: "Unpainted / plain. Invoice qty; Pair lines also shown as 2 pieces. MI-AS with no Pair/Single left as 1 unit." },
  { id: "asalato-painted", label: "Asalato painted", notes: "Painted. Pair lines counted as 2 in the Pieces column." },
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

function classifyLine(name: string, sku: string, desc: string): { family: FamilyId; displayName: string; displaySku: string } | null {
  const fromName = classify(name, sku);
  if (fromName) {
    return {
      family: fromName,
      displayName: name || sku || "Unnamed",
      displaySku: sku || "—"
    };
  }
  const asinOnly = looksLikeAsin(name) && !sku;
  const blank = !name && !sku;
  if (!asinOnly && !blank) return null;
  const fromDesc = classify((desc || "").replace(/\s+/g, " ").trim(), sku);
  if (!fromDesc) return null;
  const cleanDesc = (desc || "").replace(/\s+/g, " ").trim();
  return {
    family: fromDesc,
    displayName: cleanDesc || name || "Unnamed",
    displaySku: sku || (asinOnly ? name : "—")
  };
}

function isAsalatoPair(name: string, sku: string): boolean {
  const blob = `${name} ${sku}`.toLowerCase();
  const skuU = sku.toUpperCase();
  if (blob.includes("single")) return false;
  return /\bpair\b/.test(blob) || skuU === "MI-AS-II" || skuU === "MI-AS-2";
}

type Acc = {
  family: FamilyId;
  itemName: string;
  sku: string;
  unitsAll: number;
  units12m: number;
  units6m: number;
  units90d: number;
  invoices: Set<string>;
  revenueInrPaise: number;
  lastSold: Date | null;
  channels: Map<string, number>;
};

function emptyAcc(family: FamilyId, itemName: string, sku: string): Acc {
  return {
    family,
    itemName,
    sku,
    unitsAll: 0,
    units12m: 0,
    units6m: 0,
    units90d: 0,
    invoices: new Set(),
    revenueInrPaise: 0,
    lastSold: null,
    channels: new Map()
  };
}

function addQty(
  acc: Acc,
  qty: number,
  when: Date,
  d12: Date,
  d6: Date,
  d90: Date,
  invoiceId: string,
  revenueInrPaise: number,
  channel: string
) {
  acc.unitsAll += qty;
  if (when >= d12) acc.units12m += qty;
  if (when >= d6) acc.units6m += qty;
  if (when >= d90) acc.units90d += qty;
  acc.invoices.add(invoiceId);
  acc.revenueInrPaise += revenueInrPaise;
  if (!acc.lastSold || when > acc.lastSold) acc.lastSold = when;
  acc.channels.set(channel, (acc.channels.get(channel) || 0) + qty);
}

function classifyWoo(
  itemName: string,
  parentName: string,
  sku: string
): { family: FamilyId; displayName: string; displaySku: string } | null {
  const hit = classifyLine(itemName, sku, "");
  if (hit) return hit;
  if (parentName && parentName !== itemName) {
    const parentHit = classifyLine(parentName, sku, "");
    if (parentHit) {
      return {
        family: parentHit.family,
        displayName: itemName || parentName,
        displaySku: sku || parentHit.displaySku
      };
    }
  }
  return null;
}

function loadDoWooLines(d12: Date, d6: Date, d90: Date): Map<string, Acc> | null {
  if (!fs.existsSync(DO_LINES)) return null;
  const text = fs.readFileSync(DO_LINES, "utf8");
  const rows = text.split(/\r?\n/);
  const header = (rows[0] || "").split("\t");
  const col = (name: string) => header.indexOf(name);
  const iOrder = col("order_id");
  const iDate = col("order_date");
  const iName = col("item_name");
  const iParent = col("parent_name");
  const iSku = col("sku");
  const iQty = col("qty");
  const iTotal = col("line_total");
  if (iOrder < 0 || iName < 0) return null;

  const byKey = new Map<string, Acc>();
  for (const line of rows.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    const itemName = (cols[iName] || "").trim();
    const parentName = (cols[iParent] || "").trim();
    const sku = (cols[iSku] || "").trim();
    const hit = classifyWoo(itemName, parentName, sku);
    if (!hit) continue;
    const qty = Number(cols[iQty]) || 0;
    if (qty === 0) continue;
    const when = new Date(`${cols[iDate]}T00:00:00Z`);
    if (Number.isNaN(when.getTime())) continue;
    const key = `${hit.family}|${hit.displayName}|${hit.displaySku}`;
    let acc = byKey.get(key);
    if (!acc) {
      acc = emptyAcc(hit.family, hit.displayName, hit.displaySku);
      byKey.set(key, acc);
    }
    addQty(
      acc,
      qty,
      when,
      d12,
      d6,
      d90,
      String(cols[iOrder] || ""),
      Math.round(Number(cols[iTotal] || 0) * 100),
      "Web Sales"
    );
  }
  return byKey;
}

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
  const d6 = new Date(now);
  d6.setUTCMonth(d6.getUTCMonth() - 6);
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
          itemDesc: true,
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
      const desc = (line.itemDesc || "").trim();
      const hit = classifyLine(name, sku, desc);
      if (!hit) continue;
      const qty = Number(line.quantity) || 0;
      if (qty === 0) continue;
      matchedLines += 1;
      matchedUnits += qty;
      const key = `${hit.family}|${hit.displayName}|${hit.displaySku}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = emptyAcc(hit.family, hit.displayName, hit.displaySku);
        byKey.set(key, acc);
      }
      addQty(
        acc,
        qty,
        inv.invoiceDate,
        d12,
        d6,
        d90,
        inv.id,
        reportingInrPaiseFromMinor(inv.currency, line.lineTotalInMinor),
        inv.channelNormalized
      );
      const yk = `${hit.family}|${y}`;
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
  summary.mergeCells("A1:L1");
  summary.getCell("A2").value =
    `Source: Zoho Books historical invoices (${invoices.length.toLocaleString("en-IN")} invoices, void/draft excluded). ` +
    `Window: 1 Apr 2024 – 11 Aug 2026. Generated ${now.toISOString().slice(0, 10)}. ` +
    `Units = invoice quantity. Pieces column counts Asalato “Pair” lines as 2.`;
  summary.getCell("A2").font = { italic: true, size: 10, color: { argb: "00666666" } };
  summary.mergeCells("A2:L2");

  summary.getRow(4).values = [
    "Instrument",
    "Units — all time (invoice qty)",
    "Pieces (pair ×2)",
    "Units — last 12 months",
    "Units — last 6 months",
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
    { width: 26 },
    { width: 18 },
    { width: 22 },
    { width: 22 },
    { width: 20 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 22 },
    { width: 62 }
  ];

  let sumAll = 0;
  let sumPieces = 0;
  let sum12 = 0;
  let sum6 = 0;
  let sum90 = 0;
  let sumRev = 0;

  FAMILIES.forEach((fam, i) => {
    const rows = [...byKey.values()].filter((a) => a.family === fam.id);
    const unitsAll = rows.reduce((s, r) => s + r.unitsAll, 0);
    const units12 = rows.reduce((s, r) => s + r.units12m, 0);
    const units6 = rows.reduce((s, r) => s + r.units6m, 0);
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
    const piecesAll = rows.reduce((s, r) => {
      const mult =
        (fam.id === "asalato" || fam.id === "asalato-painted") && isAsalatoPair(r.itemName, r.sku) ? 2 : 1;
      return s + r.unitsAll * mult;
    }, 0);
    sumAll += unitsAll;
    sumPieces += piecesAll;
    sum12 += units12;
    sum6 += units6;
    sum90 += units90;
    sumRev += rev;
    const excelRow = summary.addRow([
      fam.label,
      Math.round(unitsAll * 100) / 100,
      Math.round(piecesAll * 100) / 100,
      Math.round(units12 * 100) / 100,
      Math.round(units6 * 100) / 100,
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
    excelRow.getCell(8).numFmt = '#,##0.00';
    excelRow.getCell(2).numFmt = '#,##0.00';
    excelRow.getCell(3).numFmt = '#,##0.00';
    excelRow.getCell(4).numFmt = '#,##0.00';
    excelRow.getCell(5).numFmt = '#,##0.00';
    excelRow.getCell(6).numFmt = '#,##0.00';
  });

  const totalRow = summary.addRow([
    "TOTAL (this list)",
    Math.round(sumAll * 100) / 100,
    Math.round(sumPieces * 100) / 100,
    Math.round(sum12 * 100) / 100,
    Math.round(sum6 * 100) / 100,
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
  totalRow.getCell(8).numFmt = '#,##0.00';

  const variants = wb.addWorksheet("By variant SKU", { views: [{ state: "frozen", ySplit: 1 }] });
  variants.getRow(1).values = [
    "Instrument",
    "Zoho item name",
    "SKU",
    "Units — all time",
    "Units — last 12 months",
    "Units — last 6 months",
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
      Math.round(r.units6m * 100) / 100,
      Math.round(r.units90d * 100) / 100,
      r.invoices.size,
      inr(r.revenueInrPaise),
      r.lastSold ? r.lastSold.toISOString().slice(0, 10) : "—",
      st?.inventory?.onHand ?? "",
      st?.inventory?.reserved ?? "",
      st?.productRel.name ?? ""
    ]);
    row.getCell(9).numFmt = '#,##0.00';
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

  const doByKey = loadDoWooLines(d12, d6, d90);
  if (doByKey) {
    const doSummary = wb.addWorksheet("DO Woo summary", { views: [{ state: "frozen", ySplit: 4 }] });
    doSummary.getCell("A1").value = "Same instruments — live sarveda.com (DigitalOcean WooCommerce)";
    doSummary.getCell("A1").font = { bold: true, size: 16, color: { argb: TEAL }, name: "Calibri" };
    doSummary.mergeCells("A1:L1");
    doSummary.getCell("A2").value =
      `Source: DigitalOcean MySQL shop_order line items (wc-completed + wc-processing), pulled ${now.toISOString().slice(0, 10)}. ` +
      `Website orders only — not Amazon/Flipkart/Zoho. Same matcher as the Zoho sheets.`;
    doSummary.getCell("A2").font = { italic: true, size: 10, color: { argb: "00666666" } };
    doSummary.mergeCells("A2:L2");
    doSummary.getRow(4).values = [
      "Instrument",
      "Units — all time",
      "Pieces (pair ×2)",
      "Units — last 12 months",
      "Units — last 6 months",
      "Units — last 90 days",
      "Orders",
      "Revenue (INR, line total)",
      "Woo item rows",
      "Last sold",
      "On-hand (matched SKUs)",
      "Matching notes"
    ];
    styleHeader(doSummary.getRow(4));
    doSummary.columns = [
      { width: 32 },
      { width: 18 },
      { width: 18 },
      { width: 22 },
      { width: 22 },
      { width: 20 },
      { width: 12 },
      { width: 24 },
      { width: 16 },
      { width: 14 },
      { width: 22 },
      { width: 62 }
    ];

    let doAll = 0;
    let doPieces = 0;
    let do12 = 0;
    let do6 = 0;
    let do90 = 0;
    let doRev = 0;

    FAMILIES.forEach((fam, i) => {
      const rows = [...doByKey.values()].filter((a) => a.family === fam.id);
      const unitsAll = rows.reduce((s, r) => s + r.unitsAll, 0);
      const units12 = rows.reduce((s, r) => s + r.units12m, 0);
      const units6 = rows.reduce((s, r) => s + r.units6m, 0);
      const units90 = rows.reduce((s, r) => s + r.units90d, 0);
      const ordersN = new Set(rows.flatMap((r) => [...r.invoices])).size;
      const rev = rows.reduce((s, r) => s + r.revenueInrPaise, 0);
      const last = rows.reduce<Date | null>((d, r) => (!d || (r.lastSold && r.lastSold > d) ? r.lastSold : d), null);
      const seenSku = new Set<string>();
      const onHand = rows.reduce((s, r) => {
        if (!r.sku || r.sku === "—" || seenSku.has(r.sku)) return s;
        seenSku.add(r.sku);
        return s + (stockBySku.get(r.sku)?.inventory?.onHand ?? 0);
      }, 0);
      const piecesAll = rows.reduce((s, r) => {
        const mult =
          (fam.id === "asalato" || fam.id === "asalato-painted") && isAsalatoPair(r.itemName, r.sku) ? 2 : 1;
        return s + r.unitsAll * mult;
      }, 0);
      doAll += unitsAll;
      doPieces += piecesAll;
      do12 += units12;
      do6 += units6;
      do90 += units90;
      doRev += rev;
      const excelRow = doSummary.addRow([
        fam.label,
        Math.round(unitsAll * 100) / 100,
        Math.round(piecesAll * 100) / 100,
        Math.round(units12 * 100) / 100,
        Math.round(units6 * 100) / 100,
        Math.round(units90 * 100) / 100,
        ordersN,
        inr(rev),
        rows.length,
        last ? last.toISOString().slice(0, 10) : "—",
        onHand,
        fam.notes
      ]);
      if (i % 2 === 1) {
        excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      }
      excelRow.getCell(8).numFmt = '#,##0.00';
    });
    const doTotal = doSummary.addRow([
      "TOTAL (this list)",
      Math.round(doAll * 100) / 100,
      Math.round(doPieces * 100) / 100,
      Math.round(do12 * 100) / 100,
      Math.round(do6 * 100) / 100,
      Math.round(do90 * 100) / 100,
      "",
      inr(doRev),
      doByKey.size,
      "",
      "",
      `${Math.round(doAll).toLocaleString("en-IN")} matched Woo units`
    ]);
    doTotal.font = { bold: true };
    doTotal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    doTotal.getCell(8).numFmt = '#,##0.00';

    const doVariants = wb.addWorksheet("DO Woo variants", { views: [{ state: "frozen", ySplit: 1 }] });
    doVariants.getRow(1).values = [
      "Instrument",
      "Woo item name",
      "SKU",
      "Units — all time",
      "Units — last 12 months",
      "Units — last 6 months",
      "Units — last 90 days",
      "Orders",
      "Revenue (INR)",
      "Last sold"
    ];
    styleHeader(doVariants.getRow(1));
    doVariants.columns = [
      { width: 28 },
      { width: 62 },
      { width: 18 },
      { width: 16 },
      { width: 20 },
      { width: 20 },
      { width: 18 },
      { width: 12 },
      { width: 16 },
      { width: 14 }
    ];
    const doOrdered = [...doByKey.values()].sort((a, b) => {
      const fa = FAMILIES.findIndex((f) => f.id === a.family);
      const fb = FAMILIES.findIndex((f) => f.id === b.family);
      if (fa !== fb) return fa - fb;
      return b.unitsAll - a.unitsAll;
    });
    for (const r of doOrdered) {
      const row = doVariants.addRow([
        labelById[r.family],
        r.itemName,
        r.sku,
        Math.round(r.unitsAll * 100) / 100,
        Math.round(r.units12m * 100) / 100,
        Math.round(r.units6m * 100) / 100,
        Math.round(r.units90d * 100) / 100,
        r.invoices.size,
        inr(r.revenueInrPaise),
        r.lastSold ? r.lastSold.toISOString().slice(0, 10) : "—"
      ]);
      row.getCell(9).numFmt = '#,##0.00';
    }

    const compare = wb.addWorksheet("Zoho vs DO Woo", { views: [{ state: "frozen", ySplit: 1 }] });
    compare.getRow(1).values = [
      "Instrument",
      "Zoho all-time",
      "DO Woo all-time",
      "Zoho 12m",
      "DO 12m",
      "Zoho 6m",
      "DO 6m",
      "Zoho 90d",
      "DO 90d"
    ];
    styleHeader(compare.getRow(1));
    compare.columns = [
      { width: 32 },
      { width: 16 },
      { width: 18 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 }
    ];
    for (const fam of FAMILIES) {
      const z = [...byKey.values()].filter((a) => a.family === fam.id);
      const d = [...doByKey.values()].filter((a) => a.family === fam.id);
      const sum = (rows: Acc[], key: keyof Pick<Acc, "unitsAll" | "units12m" | "units6m" | "units90d">) =>
        Math.round(rows.reduce((s, r) => s + r[key], 0) * 100) / 100;
      compare.addRow([
        fam.label,
        sum(z, "unitsAll"),
        sum(d, "unitsAll"),
        sum(z, "units12m"),
        sum(d, "units12m"),
        sum(z, "units6m"),
        sum(d, "units6m"),
        sum(z, "units90d"),
        sum(d, "units90d")
      ]);
    }
    console.log("DO Woo matched units", Math.round(doAll), "rows", doByKey.size);
    for (const fam of FAMILIES) {
      const rows = [...doByKey.values()].filter((a) => a.family === fam.id);
      const u = rows.reduce((s, r) => s + r.unitsAll, 0);
      console.log("DO", fam.label.padEnd(32), String(Math.round(u)).padStart(6), "units");
    }
  } else {
    console.log("DO Woo TSV missing — skipped DO sheets:", DO_LINES);
  }

  const notes = wb.addWorksheet("Notes");
  notes.getColumn(1).width = 100;
  notes.getCell("A1").value = "How to read this workbook";
  notes.getCell("A1").font = { bold: true, size: 14, color: { argb: TEAL } };
  const noteLines = [
    "",
    "SHEETS: Order summary / By variant SKU / Units by year / Units by channel = Zoho Books invoices. DO Woo summary / DO Woo variants = live sarveda.com WooCommerce. Zoho vs DO Woo = side-by-side units.",
    "Zoho: ZohoHistoricalInvoice + lines (~12.5k invoices). Void/draft excluded. Includes Amazon, Flipkart, web, offline channels.",
    "DO Woo: DigitalOcean MySQL wp_woocommerce_order_items joined to shop_order posts with status wc-completed or wc-processing. Website only — not marketplaces.",
    "Zoho window starts Apr 2024. DO Woo website orders go back to May 2022, so all-time DO is often higher.",
    "Last 12 months / 6 months / 90 days are rolling from today on both sources.",
    "Same product matcher on both: name + SKU, plus description only for Zoho ASIN/blank names. Kenari chimes, drum bags, coconut maracas, tongue drums excluded.",
    "Units = invoice/order line quantity. Asalato Pair lines are 1 unit; Pieces column counts those as 2. Default MI-AS without Pair/Single is left as 1.",
    "Zoho revenue uses reporting FX (USD≈83, GBP≈105). DO revenue is Woo line total (shop currency, usually INR).",
    "On-hand is catalog stock on matched SKUs and is often placeholder 999 — do not use for PO qty."
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
    const p = rows.reduce((s, r) => {
      const mult =
        (fam.id === "asalato" || fam.id === "asalato-painted") && isAsalatoPair(r.itemName, r.sku) ? 2 : 1;
      return s + r.unitsAll * mult;
    }, 0);
    const m6 = rows.reduce((s, r) => s + r.units6m, 0);
    console.log(
      fam.label.padEnd(34),
      String(Math.round(u)).padStart(6),
      "all",
      String(Math.round(m6)).padStart(5),
      "6m",
      p !== u ? `(${Math.round(p)} pcs)` : "",
      String(rows.length).padStart(3),
      "rows"
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
