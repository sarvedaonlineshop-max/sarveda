/**
 * Controlled restoration of the 17 variants auto-deactivated by the old
 * admin omit→INACTIVE bug (2026-09-02). Status-only; no price/SKU/inventory edits.
 *
 * Usage (on Lightsail, with production DATABASE_URL):
 *   npx tsx scripts/restore-accidentally-inactive-variants.ts --dry-run
 *   npx tsx scripts/restore-accidentally-inactive-variants.ts --apply
 *   npx tsx scripts/restore-accidentally-inactive-variants.ts --apply   # idempotent
 *
 * Source of truth:
 *   docs/SARVEDA_17_VARIANT_INACTIVE_CAUSE_INVESTIGATION.md
 *   docs/audit/merchant-790-to-773/merchant_790_773_recon.json
 */
import { PrismaClient, VariantStatus } from "@prisma/client";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import { createLogger, format, transports } from "winston";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const REPO_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(REPO_ROOT, "docs/audit/variant-restoration");
const REASON = "RESTORE_AFTER_VARIANT_SAVE_BUG_2026_09_02";
const ACTION = "restore-accidentally-inactive-variants";

const apply = process.argv.includes("--apply");
const dryRun = !apply;

const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console({ format: format.simple() })]
});

/** Authoritative 17 — do not expand from status=INACTIVE. */
const SOURCE_17: Array<{
  gId: string;
  sku: string;
  variantId: string;
  productSlug: string;
  itemGroupId: string;
}> = [
  { gId: "42411", sku: "MI-TD-11N-W-12", variantId: "fbcec161-3edc-463a-a7d9-2dd107e4d3ce", productSlug: "11-note-tongue-drum", itemGroupId: "42373" },
  { gId: "42412", sku: "MI-TD-11N-W-6", variantId: "160130ae-ad7a-4539-9eba-beb394c75f0a", productSlug: "11-note-tongue-drum", itemGroupId: "42373" },
  { gId: "46192", sku: "YO-M-CT-L-M-G", variantId: "a7120de4-4ec8-4819-a77b-993ff644ba55", productSlug: "yoga-mats-lotus", itemGroupId: "46171" },
  { gId: "46194", sku: "YO-M-CT-L-M-B", variantId: "52c95117-e3cf-4e13-a90e-47b95943c4a3", productSlug: "yoga-mats-lotus", itemGroupId: "46171" },
  { gId: "46195", sku: "YO-M-CT-L-M-P", variantId: "80562e2f-6fc2-421b-baaa-7b97bb1d26b6", productSlug: "yoga-mats-lotus", itemGroupId: "46171" },
  { gId: "46196", sku: "YO-M-CT-L-S-T", variantId: "858c8391-cd5c-4dbd-b775-bda237337067", productSlug: "yoga-mats-lotus", itemGroupId: "46171" },
  { gId: "46197", sku: "YO-M-CT-L-S-O", variantId: "307c95a3-7951-4bb9-8057-7bd7def34cb8", productSlug: "yoga-mats-lotus", itemGroupId: "46171" },
  { gId: "46198", sku: "YO-M-CT-L-S-Y", variantId: "26cd9417-ae90-40bf-9b59-434c5567d7b2", productSlug: "yoga-mats-lotus", itemGroupId: "46171" },
  { gId: "46199", sku: "YO-M-CT-L-S-P", variantId: "d6e6c0b6-04e5-49ef-8ecc-05bedfc89fe4", productSlug: "yoga-mats-lotus", itemGroupId: "46171" },
  { gId: "48210", sku: "MI-TF-AG-4160", variantId: "56bff370-b421-4548-8b88-76609d19e907", productSlug: "angel-tuning-forks", itemGroupId: "48205" },
  { gId: "48211", sku: "MI-TF-AG-4225", variantId: "1ea051da-a3cb-4e85-a72c-c527a0812b40", productSlug: "angel-tuning-forks", itemGroupId: "48205" },
  { gId: "7185", sku: "ME-Z-Zn-DG", variantId: "bcbefd3f-b221-476a-8f4c-bdcfd7fcc969", productSlug: "zafu-zabuton-combo-plain", itemGroupId: "7177" },
  { gId: "9314", sku: "ME-Z-Zn-EM-L-MB", variantId: "dac965f3-44e9-409b-b660-f0cebaf7b6fa", productSlug: "zafu-zabuton-combo-lotus-embroidery", itemGroupId: "9312" },
  { gId: "9568", sku: "ME-Z-Zn-EM-L-LG", variantId: "13183064-c9de-493e-b304-d8a35ac343e8", productSlug: "zafu-zabuton-combo-lotus-embroidery", itemGroupId: "9312" },
  { gId: "9597", sku: "ME-Z-Zn-LV", variantId: "19010b6c-118e-406a-a7f5-2990f69bc9c2", productSlug: "zafu-zabuton-combo-plain", itemGroupId: "7177" },
  { gId: "9598", sku: "ME-Z-Zn-LG", variantId: "c8e141e7-c922-4c28-8aea-b85fa2ed20e4", productSlug: "zafu-zabuton-combo-plain", itemGroupId: "7177" },
  { gId: "9599", sku: "ME-Z-Zn-MB", variantId: "3db6be85-a95d-4d11-ae55-7d2e43374b88", productSlug: "zafu-zabuton-combo-plain", itemGroupId: "7177" }
];

/** Known internal test variants — must never be restored by this script. */
const KNOWN_TEST_VARIANTS: Array<{ sku: string; variantId: string; productSlug: string }> = [
  { sku: "MI-TP-BL-SM", variantId: "431febda-b9bd-459d-b497-d2238128bb36", productSlug: "test-product" },
  { sku: "MI-TP-BL-LG", variantId: "6a5f4671-6b9e-4475-8b81-5ff08a9bba67", productSlug: "test-product" },
  { sku: "MI-TP-RD-SM", variantId: "a425ec2e-e6ea-46fa-a185-6d3b1c101b81", productSlug: "test-product" },
  { sku: "MI-TP-RD-LG", variantId: "3c0d7684-a43e-4c5e-9a0e-b8ebd2e40fb9", productSlug: "test-product" }
];

const prisma = new PrismaClient();

type RowOutcome =
  | "ELIGIBLE_TO_RESTORE"
  | "ALREADY_ACTIVE"
  | "MISSING"
  | "MANUAL_REVIEW"
  | "TEST_VARIANT"
  | "RESTORED"
  | "UNCHANGED_ALREADY_ACTIVE";

type PreflightRow = {
  gId: string;
  sku: string;
  expectedVariantId: string;
  expectedProductSlug: string;
  outcome: RowOutcome;
  reviewReasons: string[];
  variantId: string | null;
  productId: string | null;
  productSlug: string | null;
  productStatus: string | null;
  catalogHidden: boolean | null;
  variantStatus: string | null;
  currentSku: string | null;
  dropShipEnabled: boolean | null;
  saleInPaise: number | null;
  mrpInPaise: number | null;
  onHand: number | null;
  reserved: number | null;
  wooCommerceVariationId: number | null;
  ctxWooOfferId: number | null;
  ctxClassification: string | null;
  ctxSarvedaVariantId: string | null;
  attrsOk: boolean;
  duplicateActiveSku: boolean;
  duplicateActiveMerchantId: boolean;
};

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeCsv(filePath: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) {
    writeFileSync(filePath, "");
    return;
  }
  const keys = Object.keys(rows[0]!);
  const lines = [
    keys.join(","),
    ...rows.map((r) => keys.map((k) => escapeCsv(r[k])).join(","))
  ];
  writeFileSync(filePath, lines.join("\n") + "\n");
}

function logVariantStatusTransition(opts: {
  variantId: string;
  productId: string;
  oldStatus: string;
  newStatus: string;
  reason: string;
  action: string;
}): void {
  logger.info("variant_status_transition", {
    variantId: opts.variantId,
    productId: opts.productId,
    oldStatus: opts.oldStatus,
    newStatus: opts.newStatus,
    actorId: null,
    reason: opts.reason,
    action: opts.action,
    timestamp: new Date().toISOString()
  });
}

async function auditOne(src: (typeof SOURCE_17)[number]): Promise<PreflightRow> {
  const reviewReasons: string[] = [];
  const testHit = KNOWN_TEST_VARIANTS.find(
    (t) => t.variantId === src.variantId || t.sku === src.sku
  );
  if (testHit) {
    return {
      gId: src.gId,
      sku: src.sku,
      expectedVariantId: src.variantId,
      expectedProductSlug: src.productSlug,
      outcome: "TEST_VARIANT",
      reviewReasons: [`matches known test variant ${testHit.sku}`],
      variantId: src.variantId,
      productId: null,
      productSlug: null,
      productStatus: null,
      catalogHidden: null,
      variantStatus: null,
      currentSku: null,
      dropShipEnabled: null,
      saleInPaise: null,
      mrpInPaise: null,
      onHand: null,
      reserved: null,
      wooCommerceVariationId: null,
      ctxWooOfferId: null,
      ctxClassification: null,
      ctxSarvedaVariantId: null,
      attrsOk: false,
      duplicateActiveSku: false,
      duplicateActiveMerchantId: false
    };
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: src.variantId },
    include: {
      inventory: true,
      productRel: true,
      attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
      merchantCtxOffer: true
    }
  });

  if (!variant) {
    return {
      gId: src.gId,
      sku: src.sku,
      expectedVariantId: src.variantId,
      expectedProductSlug: src.productSlug,
      outcome: "MISSING",
      reviewReasons: ["variant id not found"],
      variantId: null,
      productId: null,
      productSlug: null,
      productStatus: null,
      catalogHidden: null,
      variantStatus: null,
      currentSku: null,
      dropShipEnabled: null,
      saleInPaise: null,
      mrpInPaise: null,
      onHand: null,
      reserved: null,
      wooCommerceVariationId: null,
      ctxWooOfferId: null,
      ctxClassification: null,
      ctxSarvedaVariantId: null,
      attrsOk: false,
      duplicateActiveSku: false,
      duplicateActiveMerchantId: false
    };
  }

  const product = variant.productRel;
  if (variant.sku !== src.sku) reviewReasons.push(`sku mismatch db=${variant.sku} expected=${src.sku}`);
  if (product.slug !== src.productSlug) {
    reviewReasons.push(`parent slug mismatch db=${product.slug} expected=${src.productSlug}`);
  }
  if (product.status !== "ACTIVE") reviewReasons.push(`parent status=${product.status}`);
  if (product.catalogHidden) reviewReasons.push("catalogHidden=true");
  if (product.deletedAt) reviewReasons.push("parent deletedAt set");
  if (variant.saleInPaise == null || variant.saleInPaise < 0 || variant.mrpInPaise == null || variant.mrpInPaise < 0) {
    reviewReasons.push("invalid price");
  }
  if (!variant.inventory) reviewReasons.push("inventory row missing");

  const attrsOk = true; // attributes may be sparse after prune; inspectable is enough
  if (variant.attributeValues === undefined) reviewReasons.push("attributes unreadable");

  const ctx =
    variant.merchantCtxOffer ??
    (await prisma.merchantCtxOffer.findUnique({ where: { wooOfferId: Number(src.gId) } }));

  if (!ctx) {
    reviewReasons.push("MerchantCtxOffer missing for g:id");
  } else {
    if (String(ctx.wooOfferId) !== src.gId) reviewReasons.push("ctx wooOfferId mismatch");
    if (ctx.sarvedaVariantId && ctx.sarvedaVariantId !== variant.id) {
      reviewReasons.push(`ctx maps to other variant ${ctx.sarvedaVariantId}`);
    }
    if (!ctx.sarvedaVariantId) reviewReasons.push("ctx sarvedaVariantId null");
    if (ctx.classification !== "PUBLISH") reviewReasons.push(`ctx classification=${ctx.classification}`);
  }

  const wooId = variant.wooCommerceVariationId;
  if (wooId != null && String(wooId) !== src.gId) {
    reviewReasons.push(`wooCommerceVariationId=${wooId} != g:id ${src.gId}`);
  }

  const dupSku = await prisma.productVariant.findMany({
    where: { sku: variant.sku, status: "ACTIVE", id: { not: variant.id } },
    select: { id: true }
  });
  const duplicateActiveSku = dupSku.length > 0;
  if (duplicateActiveSku) reviewReasons.push(`duplicate ACTIVE sku on ${dupSku.map((d) => d.id).join(",")}`);

  let duplicateActiveMerchantId = false;
  if (wooId != null) {
    const dupMerchant = await prisma.productVariant.findMany({
      where: {
        wooCommerceVariationId: wooId,
        status: "ACTIVE",
        id: { not: variant.id }
      },
      select: { id: true }
    });
    duplicateActiveMerchantId = dupMerchant.length > 0;
    if (duplicateActiveMerchantId) {
      reviewReasons.push(`duplicate ACTIVE wooCommerceVariationId on ${dupMerchant.map((d) => d.id).join(",")}`);
    }
  }

  let outcome: RowOutcome;
  if (reviewReasons.length) {
    outcome = "MANUAL_REVIEW";
  } else if (variant.status === "ACTIVE") {
    outcome = "ALREADY_ACTIVE";
  } else if (variant.status === "INACTIVE") {
    outcome = "ELIGIBLE_TO_RESTORE";
  } else {
    outcome = "MANUAL_REVIEW";
    reviewReasons.push(`unexpected status ${variant.status}`);
  }

  return {
    gId: src.gId,
    sku: src.sku,
    expectedVariantId: src.variantId,
    expectedProductSlug: src.productSlug,
    outcome,
    reviewReasons,
    variantId: variant.id,
    productId: product.id,
    productSlug: product.slug,
    productStatus: product.status,
    catalogHidden: product.catalogHidden,
    variantStatus: variant.status,
    currentSku: variant.sku,
    dropShipEnabled: variant.dropShipEnabled,
    saleInPaise: variant.saleInPaise,
    mrpInPaise: variant.mrpInPaise,
    onHand: variant.inventory?.onHand ?? null,
    reserved: variant.inventory?.reserved ?? null,
    wooCommerceVariationId: variant.wooCommerceVariationId,
    ctxWooOfferId: ctx?.wooOfferId ?? null,
    ctxClassification: ctx?.classification ?? null,
    ctxSarvedaVariantId: ctx?.sarvedaVariantId ?? null,
    attrsOk,
    duplicateActiveSku,
    duplicateActiveMerchantId
  };
}

async function inventoryTotals() {
  const [total, active, inactive] = await Promise.all([
    prisma.productVariant.count(),
    prisma.productVariant.count({ where: { status: "ACTIVE" } }),
    prisma.productVariant.count({ where: { status: "INACTIVE" } })
  ]);
  const testActive = await prisma.productVariant.count({
    where: {
      id: { in: KNOWN_TEST_VARIANTS.map((t) => t.variantId) },
      status: "ACTIVE"
    }
  });
  const testAny = await prisma.productVariant.findMany({
    where: { id: { in: KNOWN_TEST_VARIANTS.map((t) => t.variantId) } },
    select: { id: true, sku: true, status: true, productRel: { select: { slug: true, catalogHidden: true, status: true } } }
  });
  return { total, active, inactive, testActive, testAny };
}

async function main() {
  if (SOURCE_17.length !== 17) {
    throw new Error(`SOURCE_17 must be exactly 17 rows, got ${SOURCE_17.length}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  console.log(dryRun ? "MODE=dry-run" : "MODE=apply");
  console.log(`SOURCE_ROWS=${SOURCE_17.length}`);

  const preflight: PreflightRow[] = [];
  for (const src of SOURCE_17) {
    preflight.push(await auditOne(src));
  }

  const counts = {
    SOURCE_ROWS: 17,
    ELIGIBLE_TO_RESTORE: preflight.filter((r) => r.outcome === "ELIGIBLE_TO_RESTORE").length,
    MANUAL_REVIEW: preflight.filter((r) => r.outcome === "MANUAL_REVIEW").length,
    ALREADY_ACTIVE: preflight.filter((r) => r.outcome === "ALREADY_ACTIVE").length,
    MISSING: preflight.filter((r) => r.outcome === "MISSING").length,
    TEST_VARIANTS_IN_SET: preflight.filter((r) => r.outcome === "TEST_VARIANT").length,
    DUPLICATE_SKUS: preflight.filter((r) => r.duplicateActiveSku).length,
    DUPLICATE_MERCHANT_IDS: preflight.filter((r) => r.duplicateActiveMerchantId).length
  };

  console.log(JSON.stringify(counts, null, 2));

  const preflightCsvName = dryRun ? "restoration_preflight.csv" : "restoration_preflight_after.csv";
  writeCsv(
    path.join(OUT_DIR, preflightCsvName),
    preflight.map((r) => ({
      g_id: r.gId,
      sku: r.sku,
      expected_variant_id: r.expectedVariantId,
      outcome: r.outcome,
      review_reasons: r.reviewReasons.join("|"),
      variant_id: r.variantId,
      product_id: r.productId,
      product_slug: r.productSlug,
      product_status: r.productStatus,
      catalog_hidden: r.catalogHidden,
      variant_status: r.variantStatus,
      current_sku: r.currentSku,
      drop_ship_enabled: r.dropShipEnabled,
      sale_in_paise: r.saleInPaise,
      mrp_in_paise: r.mrpInPaise,
      on_hand: r.onHand,
      reserved: r.reserved,
      woo_variation_id: r.wooCommerceVariationId,
      ctx_woo_offer_id: r.ctxWooOfferId,
      ctx_classification: r.ctxClassification,
      ctx_sarveda_variant_id: r.ctxSarvedaVariantId,
      duplicate_active_sku: r.duplicateActiveSku,
      duplicate_active_merchant_id: r.duplicateActiveMerchantId
    }))
  );

  const clean =
    counts.ELIGIBLE_TO_RESTORE === 17 &&
    counts.MANUAL_REVIEW === 0 &&
    counts.ALREADY_ACTIVE === 0 &&
    counts.MISSING === 0 &&
    counts.TEST_VARIANTS_IN_SET === 0 &&
    counts.DUPLICATE_SKUS === 0 &&
    counts.DUPLICATE_MERCHANT_IDS === 0;

  const idempotentClean =
    counts.ALREADY_ACTIVE === 17 &&
    counts.ELIGIBLE_TO_RESTORE === 0 &&
    counts.MANUAL_REVIEW === 0 &&
    counts.MISSING === 0 &&
    counts.TEST_VARIANTS_IN_SET === 0;

  const resultRows: Array<Record<string, unknown>> = [];
  let restored = 0;
  let unchangedAlreadyActive = 0;

  if (dryRun) {
    console.log(clean ? "PREFLIGHT_CLEAN=yes" : "PREFLIGHT_CLEAN=no (do not apply)");
    for (const r of preflight) {
      resultRows.push({
        variantId: r.variantId,
        sku: r.sku,
        gId: r.gId,
        oldStatus: r.variantStatus,
        newStatus: r.variantStatus,
        changed: false,
        reason: REASON,
        mode: "dry-run",
        outcome: r.outcome
      });
    }
  } else if (idempotentClean) {
    console.log("IDEMPOTENT: all 17 already ACTIVE — no changes");
    for (const r of preflight) {
      unchangedAlreadyActive += 1;
      resultRows.push({
        variantId: r.variantId,
        sku: r.sku,
        gId: r.gId,
        oldStatus: "ACTIVE",
        newStatus: "ACTIVE",
        changed: false,
        reason: REASON,
        mode: "apply-idempotent",
        outcome: "UNCHANGED_ALREADY_ACTIVE"
      });
    }
  } else if (!clean) {
    console.error("REFUSING APPLY — preflight not clean");
    process.exitCode = 2;
  } else {
    for (const r of preflight) {
      if (r.outcome !== "ELIGIBLE_TO_RESTORE" || !r.variantId || !r.productId) continue;
      const updated = await prisma.productVariant.update({
        where: { id: r.variantId },
        data: { status: VariantStatus.ACTIVE },
        select: { id: true, status: true, sku: true }
      });
      logVariantStatusTransition({
        variantId: r.variantId,
        productId: r.productId,
        oldStatus: "INACTIVE",
        newStatus: updated.status,
        reason: REASON,
        action: ACTION
      });
      restored += 1;
      resultRows.push({
        variantId: r.variantId,
        sku: r.sku,
        gId: r.gId,
        oldStatus: "INACTIVE",
        newStatus: updated.status,
        changed: true,
        reason: REASON,
        mode: "apply",
        outcome: "RESTORED"
      });
    }
  }

  const resultCsvName =
    dryRun ? "restoration_result_dry_run.csv"
    : restored > 0 ? "restoration_result.csv"
    : "restoration_result_idempotent.csv";
  writeCsv(path.join(OUT_DIR, resultCsvName), resultRows);

  const totals = await inventoryTotals();
  const genuineActiveEstimate = totals.active - totals.testActive;

  const summary = {
    mode: dryRun ? "dry-run" : "apply",
    reason: REASON,
    counts,
    clean,
    idempotentClean,
    RESTORED: restored,
    CHANGED: restored,
    resultCsv: resultCsvName,
    ALREADY_ACTIVE_AFTER: unchangedAlreadyActive || counts.ALREADY_ACTIVE,
    TOTAL_VARIANTS: totals.total,
    ACTIVE_VARIANTS: totals.active,
    INACTIVE_VARIANTS: totals.inactive,
    KNOWN_TEST_VARIANTS: KNOWN_TEST_VARIANTS,
    testVariantsDb: totals.testAny,
    GENUINE_ACTIVE_ESTIMATE: genuineActiveEstimate,
    BUSINESS_BASELINE_NOTE:
      "794 admin inventory ≈ all variants; 4 test (often hidden) excluded from Merchant 790 genuine shop offers",
    timestamp: new Date().toISOString()
  };

  writeFileSync(path.join(OUT_DIR, "restoration_summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
