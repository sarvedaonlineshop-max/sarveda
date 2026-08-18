/**
 * Audit Zoho line matching vs the export classifier.
 *   cd backend && npx tsx scripts/audit-instrument-sales-match.ts
 */
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const prisma = new PrismaClient({ log: ["error"] });

const BROAD: { id: string; re: RegExp }[] = [
  { id: "pangi", re: /pangi|seed\s*shell\s*rattle|mi-ps(?![a-z])/i },
  { id: "kenari", re: /kenari|mi-kr|mi-ks/i },
  { id: "asalato", re: /asalato|aslatua|aslatu|aslatau|kashaka|cascas|mi-as/i },
  { id: "rainstick", re: /rain\s*stick|rainstick|mi-rs|mi-br-n/i },
  { id: "shamanic-drum", re: /shamanic|frame\s*drum|mi-sd|ms-d/i },
  { id: "ocean-drum", re: /ocean\s*drum|wave\s*drum|mi-od/i },
  { id: "egg-shaker", re: /egg\s*shaker|mi-es/i },
  { id: "wooden-shaker", re: /wooden\s*(shaker|maracas)|maracas|mi-wm|mi-cm/i },
  { id: "den-den-daiko", re: /den\s*den|denden|daiko|spin\s*\/?\s*twist|twist\s*drum|mi-twd|mi-td-yy/i },
  { id: "didgeridoo", re: /didger|digeredoo|digeridoo|mi-dg/i },
  { id: "tambourine", re: /tambourine|mi-t-/i },
  { id: "caxixi", re: /caxixi|caxhixi|caxix|mi-cx/i },
  { id: "shaker-generic", re: /\bshaker\b|\brattle\b/i }
];

function looksLikeAsin(value: string): boolean {
  return /^B0[A-Z0-9]{8,}$/i.test(value.trim());
}

async function main() {
  const invoices = await prisma.zohoHistoricalInvoice.findMany({
    where: { status: { notIn: ["void", "draft"] } },
    select: {
      status: true,
      channelNormalized: true,
      lines: { select: { itemName: true, sku: true, itemDesc: true, quantity: true } }
    }
  });

  type Row = { name: string; sku: string; desc: string; qty: number; channel: string };
  const rows: Row[] = [];
  for (const inv of invoices) {
    for (const line of inv.lines) {
      rows.push({
        name: (line.itemName || "").trim(),
        sku: (line.sku || "").trim(),
        desc: (line.itemDesc || "").trim().slice(0, 80),
        qty: Number(line.quantity) || 0,
        channel: inv.channelNormalized
      });
    }
  }

  const catalog = await prisma.product.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: "Pangi", mode: "insensitive" } },
        { name: { contains: "Kenari", mode: "insensitive" } },
        { name: { contains: "Asalato", mode: "insensitive" } },
        { name: { contains: "Aslatua", mode: "insensitive" } },
        { name: { contains: "Kashaka", mode: "insensitive" } },
        { name: { contains: "Rainstick", mode: "insensitive" } },
        { name: { contains: "Shamanic", mode: "insensitive" } },
        { name: { contains: "Ocean Drum", mode: "insensitive" } },
        { name: { contains: "Egg Shaker", mode: "insensitive" } },
        { name: { contains: "Maracas", mode: "insensitive" } },
        { name: { contains: "Wooden Shaker", mode: "insensitive" } },
        { name: { contains: "Daiko", mode: "insensitive" } },
        { name: { contains: "Twist Drum", mode: "insensitive" } },
        { name: { contains: "Didger", mode: "insensitive" } },
        { name: { contains: "Tambourine", mode: "insensitive" } },
        { name: { contains: "Caxixi", mode: "insensitive" } }
      ]
    },
    select: {
      name: true,
      slug: true,
      status: true,
      variants: { select: { sku: true, status: true } }
    }
  });

  console.log("\n=== CATALOG PRODUCTS (name match) ===");
  for (const p of catalog.sort((a, b) => a.name.localeCompare(b.name))) {
    const skus = p.variants.map((v) => `${v.status}:${v.sku}`).join(", ");
    console.log(`${p.status.padEnd(8)} ${p.slug.padEnd(48)} ${p.name} | ${skus}`);
  }

  const byKey = new Map<string, { name: string; sku: string; qty: number; n: number; channels: Set<string> }>();
  for (const r of rows) {
    const key = `${r.name}||${r.sku}`;
    const acc = byKey.get(key) || { name: r.name, sku: r.sku, qty: 0, n: 0, channels: new Set() };
    acc.qty += r.qty;
    acc.n += 1;
    acc.channels.add(r.channel);
    byKey.set(key, acc);
  }

  console.log("\n=== BROAD HITS NOT OBVIOUSLY IN FAMILY (name+sku) ===");
  for (const fam of BROAD) {
    const hits = [...byKey.values()]
      .filter((r) => fam.re.test(`${r.name} ${r.sku}`))
      .sort((a, b) => b.qty - a.qty);
    const units = hits.reduce((s, r) => s + r.qty, 0);
    console.log(`\n-- ${fam.id}  ${hits.length} names  ${Math.round(units)} units --`);
    for (const h of hits.slice(0, 40)) {
      console.log(
        `  ${String(Math.round(h.qty)).padStart(5)} u  ${String(h.n).padStart(4)} lines  sku=${(h.sku || "—").slice(0, 28).padEnd(28)}  ${h.name.slice(0, 80)}`
      );
    }
    if (hits.length > 40) console.log(`  … ${hits.length - 40} more names`);
  }

  const asins = [...byKey.values()].filter((r) => looksLikeAsin(r.name) && !r.sku).sort((a, b) => b.qty - a.qty);
  console.log(`\n=== ASIN-ONLY ITEM NAMES (${asins.length}) top 30 ===`);
  for (const a of asins.slice(0, 30)) {
    console.log(`  ${String(Math.round(a.qty)).padStart(5)}  ${a.name}`);
  }

  const unnamed = [...byKey.values()].filter((r) => !r.name && !r.sku);
  const blankName = [...byKey.values()].filter((r) => !r.name && r.sku);
  console.log(`\nblank name+sku groups: ${unnamed.length} qty ${unnamed.reduce((s, r) => s + r.qty, 0)}`);
  console.log(`sku-only (empty name) groups: ${blankName.length}`);
  for (const r of blankName.sort((a, b) => b.qty - a.qty).slice(0, 25)) {
    console.log(`  ${String(Math.round(r.qty)).padStart(5)}  sku=${r.sku}`);
  }

  const skuOnlyMi = [...byKey.values()]
    .filter((r) => /^MI-/i.test(r.sku || r.name))
    .filter((r) => /MI-(PS|KR|AS|RS|SD|OD|ES|WM|TWD|TD-YY|DG|T-|CX|KS|BR)/i.test(`${r.name} ${r.sku}`));
  console.log(`\n=== ALL MI-* SKUS in instrument-ish prefixes ===`);
  const skuAgg = new Map<string, number>();
  for (const r of skuOnlyMi) {
    const s = (r.sku || r.name).toUpperCase();
    skuAgg.set(s, (skuAgg.get(s) || 0) + r.qty);
  }
  for (const [s, q] of [...skuAgg.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${s.padEnd(24)} ${Math.round(q)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
