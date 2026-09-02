/**
 * Diagnose native Google Merchant feed eligibility (no Merchant Center calls).
 *
 *   npx tsx scripts/diagnose-merchant-feed.ts
 *   MERCHANT_FEED_SITE_URL=https://sarveda.com npx tsx scripts/diagnose-merchant-feed.ts
 */
import { createReadStream, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import readline from "readline";
import dotenv from "dotenv";

import {
  buildGoogleMerchantFeed,
  validateFeedHistoricalContinuity
} from "../src/modules/merchant/googleMerchantFeed";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO_ROOT = path.resolve(__dirname, "../..");
const BACKFILL_TSV = path.join(REPO_ROOT, "docs/audit/merchant_identity_backfilled.tsv");
const OUT_JSON = path.join(REPO_ROOT, "docs/audit/merchant_feed_v1_diagnostics.json");
const OUT_SAMPLE = path.join(REPO_ROOT, "docs/audit/merchant_feed_v1_sample.xml");

async function readBackfill(
  filePath: string
): Promise<Array<{ woo_offer_id: string; woo_parent_id: string; merchant_id: string }>> {
  if (!existsSync(filePath)) return [];
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  let headers: string[] | null = null;
  const rows: Array<{ woo_offer_id: string; woo_parent_id: string; merchant_id: string }> = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (!headers) {
      headers = cols;
      continue;
    }
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    rows.push({
      woo_offer_id: obj.woo_offer_id || "",
      woo_parent_id: obj.woo_parent_id || "",
      merchant_id: obj.merchant_id || ""
    });
  }
  return rows;
}

async function main() {
  const { items, diagnostics, xml } = await buildGoogleMerchantFeed();
  const backfilled = await readBackfill(BACKFILL_TSV);
  const continuity = validateFeedHistoricalContinuity(items, backfilled);

  const storeLinks = items.filter((i) => i.link.includes("/store/")).length;
  const demoLinks = items.filter((i) => i.link.includes("sarveda-demo.xyz")).length;
  const httpsImages = items.filter((i) => i.imageLink.startsWith("https://")).length;

  const samples = {
    simple: items.find((i) => !i.itemGroupId) || null,
    variable: items.find((i) => i.itemGroupId) || null,
    outOfStock: items.find((i) => i.availability === "out_of_stock") || null
  };

  const report = {
    diagnostics,
    continuity,
    linkChecks: {
      storeLinksEmitted: storeLinks,
      demoHostLinksEmitted: demoLinks,
      httpsImages,
      totalItems: items.length
    },
    samples: {
      simpleId: samples.simple?.gId ?? null,
      variableId: samples.variable?.gId ?? null,
      outOfStockId: samples.outOfStock?.gId ?? null
    }
  };

  mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");

  // Truncated sample XML (first 3 items) for inspection
  const sampleItems = [samples.simple, samples.variable, samples.outOfStock].filter(Boolean);
  const sampleXml = xml; // full xml also written truncated via first 80KB if huge
  writeFileSync(
    OUT_SAMPLE,
    sampleXml.length > 200_000 ? sampleXml.slice(0, 200_000) + "\n<!-- truncated -->\n" : sampleXml,
    "utf8"
  );

  console.log(JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`Wrote ${OUT_SAMPLE} (${xml.length} chars full feed in memory)`);

  if (continuity.idMismatches.length > 0 || continuity.itemGroupMismatches.length > 0) {
    console.error("BLOCKER: historical identity mismatches in feed");
    process.exitCode = 2;
  }
  if (storeLinks > 0) {
    console.error("BLOCKER: /store links in feed");
    process.exitCode = 3;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
