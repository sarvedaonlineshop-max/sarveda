/**
 * Resolve WooCommerce audio attachment IDs in wc-products.csv → Product.audioUrl.
 * CSV stores numeric attachment IDs in Meta: product_audio_N_audio (not full URLs).
 * Attachment map is built from data/variations.xml (same as sync-product-galleries).
 *
 * Usage: npx tsx scripts/sync-product-audio.ts [--dry-run]
 */
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { loadAttachmentMapFromWxr } from "./wxr-attachments";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const CSV_PATH = path.resolve(__dirname, "../prisma/wc-products.csv");
const REPO_ROOT = path.resolve(__dirname, "../..");

function firstAudioUrlFromRow(row: Record<string, string>, attachments: Map<number, string>): string | null {
  for (let i = 0; i < 12; i++) {
    const raw = (row[`Meta: product_audio_${i}_audio`] ?? "").trim();
    if (!raw) continue;
    if (raw.startsWith("http")) return raw;
    if (/^\d+$/.test(raw)) {
      const url = attachments.get(parseInt(raw, 10));
      if (url) return url;
    }
  }
  const simple = (row["Meta: simple_product_0_audio"] ?? "").trim();
  if (simple.startsWith("http")) return simple;
  if (/^\d+$/.test(simple)) {
    const url = attachments.get(parseInt(simple, 10));
    if (url) return url;
  }
  return null;
}

async function main(): Promise<void> {
  const attachments = loadAttachmentMapFromWxr(REPO_ROOT);
  console.log(`Attachment map: ${attachments.size} entries (media + products + variations WXR)`);

  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, { relax_column_count: true, skip_empty_lines: true, bom: true }) as string[][];
  const header = rows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    if (!(h in idx)) idx[h] = i;
  });

  let updated = 0;
  let skipped = 0;
  let noProduct = 0;

  for (const row of rows.slice(1)) {
    const type = (row[idx["Type"]] ?? "").trim().toLowerCase();
    if (type !== "simple" && type !== "variable") continue;

    const wooId = parseInt(row[idx["ID"]] ?? row[0] ?? "", 10);
    if (!Number.isFinite(wooId)) continue;

    const record: Record<string, string> = {};
    for (const [k, i] of Object.entries(idx)) record[k] = row[i] ?? "";

    const audioUrl = firstAudioUrlFromRow(record, attachments);
    if (!audioUrl) {
      skipped++;
      continue;
    }

    const product = await prisma.product.findFirst({
      where: { wooCommerceId: wooId },
      select: { id: true, slug: true, audioUrl: true }
    });
    if (!product) {
      noProduct++;
      continue;
    }
    if (!force && product.audioUrl === audioUrl) {
      skipped++;
      continue;
    }
    if (!force && product.audioUrl?.includes("sarveda-media.s3") && audioUrl.includes("sarveda.com")) {
      skipped++;
      continue;
    }

    console.log(`${dryRun ? "[dry] " : ""}${product.slug}: ${audioUrl.slice(0, 72)}…`);
    if (!dryRun) {
      await prisma.product.update({
        where: { id: product.id },
        data: { hasAudio: true, audioUrl }
      });
    }
    updated++;
  }

  console.log(`Done. ${dryRun ? "Would update" : "Updated"}: ${updated}, unchanged/missing audio: ${skipped}, no DB product: ${noProduct}`);
  if (!dryRun && updated > 0) {
    console.log("Next: npm run migrate:media  (copy audio files to S3 and rewrite URLs)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
