/**
 * Merchant identity backfill — candidate filtering + preflight (no DB writes).
 *
 * Source of truth: docs/audit/merchant_woo_sarveda_mapping.tsv
 * Only HIGH-confidence 1:1 Woo offer → Sarveda variant pairs are accepted.
 *
 * Design: ProductVariant.wooCommerceVariationId stores the historical Woo
 * *sellable offer* ID (variation ID for variables; product ID for simples) so
 * a future feed can emit id = gla_<wooCommerceVariationId> consistently.
 * Product.wooCommerceId remains the Woo parent/product id (item_group for variables).
 */

export type MappingConfidence = "high" | "medium" | "ambiguous" | "unmatched" | string;

export type MappingRow = {
  merchant_id: string;
  merchant_item_group_id: string;
  merchant_title: string;
  merchant_link?: string;
  woo_offer_id: string;
  woo_parent_id: string;
  woo_offer_kind: string;
  woo_status?: string;
  woo_sku: string;
  woo_attributes: string;
  sarveda_product_id: string;
  sarveda_variant_id: string;
  sarveda_sku: string;
  sarveda_slug?: string;
  match_method: string;
  match_confidence: MappingConfidence;
  notes?: string;
  url_class?: string;
  url_notes?: string;
};

export type ReviewReason =
  | "MEDIUM_CONFIDENCE"
  | "AMBIGUOUS"
  | "UNMATCHED"
  | "PARENT_ONLY"
  | "SARVEDA_CONFLICT"
  | "MISSING_WOO_OFFER_ID"
  | "MISSING_VARIANT"
  | "MISSING_PRODUCT"
  | "PARENT_MISMATCH"
  | "EXISTING_ID_CONFLICT"
  | "WOO_ID_ALREADY_ASSIGNED"
  | "DUPLICATE_WOO_OFFER"
  | "DUPLICATE_SARVEDA_TARGET"
  | "OTHER";

export type ReviewAction =
  | "manual_reconcile"
  | "exclude_parent_row"
  | "resolve_duplicate_mapping"
  | "create_or_link_variant"
  | "verify_parent_wooCommerceId"
  | "verify_existing_wooCommerceVariationId"
  | "none";

export type ReviewRow = MappingRow & {
  reason_not_backfilled: ReviewReason;
  recommended_review_action: ReviewAction;
};

export type CandidateRow = {
  merchant_id: string;
  merchant_item_group_id: string;
  merchant_title: string;
  woo_offer_id: number;
  woo_parent_id: number;
  woo_offer_kind: "variation" | "simple" | string;
  woo_sku: string;
  woo_attributes: string;
  sarveda_product_id: string;
  sarveda_variant_id: string;
  sarveda_sku: string;
  match_method: string;
  match_confidence: "high";
};

export type VariantIdentitySnapshot = {
  id: string;
  productId: string;
  sku: string;
  wooCommerceVariationId: number | null;
  productWooCommerceId: number | null;
};

export type PreflightAccepted = CandidateRow & {
  previous_wooCommerceVariationId: number | null;
  new_wooCommerceVariationId: number;
  writeNeeded: boolean;
};

export type PreflightResult = {
  accepted: PreflightAccepted[];
  reviews: ReviewRow[];
  stats: {
    sourceRows: number;
    highRows: number;
    mediumRows: number;
    ambiguousRows: number;
    unmatchedRows: number;
    parentOnlyRows: number;
    conflictVariantRows: number;
    preflightSafe: number;
    alreadyCorrect: number;
    toWrite: number;
    duplicateWooInAccepted: number;
    duplicateSarvedaInAccepted: number;
  };
};

const PARENT_ONLY_METHODS = new Set([
  "parent_only_product_level",
  "parent_only_no_sarveda"
]);

function parsePositiveInt(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t || !/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

function isParentOnly(row: MappingRow): boolean {
  if (PARENT_ONLY_METHODS.has(row.match_method)) return true;
  const kind = (row.woo_offer_kind || "").toLowerCase();
  return kind === "variable_parent" || kind === "parent";
}

function reviewActionFor(reason: ReviewReason): ReviewAction {
  switch (reason) {
    case "PARENT_ONLY":
      return "exclude_parent_row";
    case "SARVEDA_CONFLICT":
    case "DUPLICATE_WOO_OFFER":
    case "DUPLICATE_SARVEDA_TARGET":
      return "resolve_duplicate_mapping";
    case "MISSING_VARIANT":
    case "MISSING_PRODUCT":
      return "create_or_link_variant";
    case "PARENT_MISMATCH":
      return "verify_parent_wooCommerceId";
    case "EXISTING_ID_CONFLICT":
    case "WOO_ID_ALREADY_ASSIGNED":
      return "verify_existing_wooCommerceVariationId";
    case "MEDIUM_CONFIDENCE":
    case "AMBIGUOUS":
    case "UNMATCHED":
      return "manual_reconcile";
    default:
      return "manual_reconcile";
  }
}

function toReview(row: MappingRow, reason: ReviewReason): ReviewRow {
  return {
    ...row,
    reason_not_backfilled: reason,
    recommended_review_action: reviewActionFor(reason)
  };
}

/**
 * Identify Sarveda variants that appear with multiple distinct Woo offer IDs
 * inside the HIGH-confidence set (audit: 2 conflict cases).
 */
export function findHighConfidenceSarvedaConflicts(rows: MappingRow[]): Set<string> {
  const byVariant = new Map<string, Set<number>>();
  for (const row of rows) {
    if ((row.match_confidence || "").toLowerCase() !== "high") continue;
    const vid = (row.sarveda_variant_id || "").trim();
    const woo = parsePositiveInt(row.woo_offer_id);
    if (!vid || woo == null) continue;
    let set = byVariant.get(vid);
    if (!set) {
      set = new Set();
      byVariant.set(vid, set);
    }
    set.add(woo);
  }
  const conflicts = new Set<string>();
  for (const [vid, woos] of byVariant) {
    if (woos.size > 1) conflicts.add(vid);
  }
  return conflicts;
}

/**
 * Partition mapping rows into provisional HIGH candidates vs residual reviews
 * (before DB existence / parent checks).
 */
export function partitionMappingRows(rows: MappingRow[]): {
  provisional: CandidateRow[];
  reviews: ReviewRow[];
  conflictVariantIds: Set<string>;
  counts: {
    high: number;
    medium: number;
    ambiguous: number;
    unmatched: number;
    parentOnly: number;
    conflictRows: number;
  };
} {
  const conflictVariantIds = findHighConfidenceSarvedaConflicts(rows);
  const provisional: CandidateRow[] = [];
  const reviews: ReviewRow[] = [];
  const counts = {
    high: 0,
    medium: 0,
    ambiguous: 0,
    unmatched: 0,
    parentOnly: 0,
    conflictRows: 0
  };

  for (const row of rows) {
    const conf = (row.match_confidence || "").toLowerCase();

    if (isParentOnly(row)) {
      counts.parentOnly += 1;
      reviews.push(toReview(row, "PARENT_ONLY"));
      continue;
    }

    if (conf === "medium") {
      counts.medium += 1;
      reviews.push(toReview(row, "MEDIUM_CONFIDENCE"));
      continue;
    }
    if (conf === "ambiguous") {
      counts.ambiguous += 1;
      reviews.push(toReview(row, "AMBIGUOUS"));
      continue;
    }
    if (conf === "unmatched" || conf === "") {
      counts.unmatched += 1;
      reviews.push(toReview(row, "UNMATCHED"));
      continue;
    }
    if (conf !== "high") {
      reviews.push(toReview(row, "OTHER"));
      continue;
    }

    counts.high += 1;

    const wooOfferId = parsePositiveInt(row.woo_offer_id);
    const wooParentId = parsePositiveInt(row.woo_parent_id);
    const variantId = (row.sarveda_variant_id || "").trim();
    const productId = (row.sarveda_product_id || "").trim();

    if (wooOfferId == null) {
      reviews.push(toReview(row, "MISSING_WOO_OFFER_ID"));
      continue;
    }
    if (!variantId) {
      reviews.push(toReview(row, "MISSING_VARIANT"));
      continue;
    }
    if (!productId) {
      reviews.push(toReview(row, "MISSING_PRODUCT"));
      continue;
    }
    if (conflictVariantIds.has(variantId)) {
      counts.conflictRows += 1;
      reviews.push(toReview(row, "SARVEDA_CONFLICT"));
      continue;
    }
    if (wooParentId == null) {
      reviews.push(toReview(row, "OTHER"));
      continue;
    }

    provisional.push({
      merchant_id: row.merchant_id,
      merchant_item_group_id: row.merchant_item_group_id,
      merchant_title: row.merchant_title,
      woo_offer_id: wooOfferId,
      woo_parent_id: wooParentId,
      woo_offer_kind: row.woo_offer_kind,
      woo_sku: row.woo_sku,
      woo_attributes: row.woo_attributes,
      sarveda_product_id: productId,
      sarveda_variant_id: variantId,
      sarveda_sku: row.sarveda_sku,
      match_method: row.match_method,
      match_confidence: "high"
    });
  }

  return { provisional, reviews, conflictVariantIds, counts };
}

/**
 * Enforce 1:1 uniqueness + DB existence + parent agreement + idempotent conflict rules.
 */
export function preflightCandidates(
  rows: MappingRow[],
  variantsById: Map<string, VariantIdentitySnapshot>,
  /** Existing non-null wooCommerceVariationId → variant id (entire catalog). */
  existingWooOfferOwners: Map<number, string>
): PreflightResult {
  const { provisional, reviews, counts } = partitionMappingRows(rows);

  // Detect many-to-one / one-to-many inside provisional set
  const wooToVariants = new Map<number, Set<string>>();
  const variantToWoos = new Map<string, Set<number>>();
  for (const c of provisional) {
    let wv = wooToVariants.get(c.woo_offer_id);
    if (!wv) {
      wv = new Set();
      wooToVariants.set(c.woo_offer_id, wv);
    }
    wv.add(c.sarveda_variant_id);

    let vw = variantToWoos.get(c.sarveda_variant_id);
    if (!vw) {
      vw = new Set();
      variantToWoos.set(c.sarveda_variant_id, vw);
    }
    vw.add(c.woo_offer_id);
  }

  const dupWoo = new Set<number>();
  for (const [woo, vs] of wooToVariants) {
    if (vs.size > 1) dupWoo.add(woo);
  }
  const dupSv = new Set<string>();
  for (const [vid, woos] of variantToWoos) {
    if (woos.size > 1) dupSv.add(vid);
  }

  const accepted: PreflightAccepted[] = [];
  const allReviews = [...reviews];
  let alreadyCorrect = 0;
  let toWrite = 0;

  for (const c of provisional) {
    const sourceRow: MappingRow = {
      merchant_id: c.merchant_id,
      merchant_item_group_id: c.merchant_item_group_id,
      merchant_title: c.merchant_title,
      woo_offer_id: String(c.woo_offer_id),
      woo_parent_id: String(c.woo_parent_id),
      woo_offer_kind: c.woo_offer_kind,
      woo_sku: c.woo_sku,
      woo_attributes: c.woo_attributes,
      sarveda_product_id: c.sarveda_product_id,
      sarveda_variant_id: c.sarveda_variant_id,
      sarveda_sku: c.sarveda_sku,
      match_method: c.match_method,
      match_confidence: "high"
    };

    if (dupWoo.has(c.woo_offer_id)) {
      allReviews.push(toReview(sourceRow, "DUPLICATE_WOO_OFFER"));
      continue;
    }
    if (dupSv.has(c.sarveda_variant_id)) {
      allReviews.push(toReview(sourceRow, "DUPLICATE_SARVEDA_TARGET"));
      continue;
    }

    const snap = variantsById.get(c.sarveda_variant_id);
    if (!snap) {
      allReviews.push(toReview(sourceRow, "MISSING_VARIANT"));
      continue;
    }
    if (snap.productId !== c.sarveda_product_id) {
      allReviews.push(toReview(sourceRow, "OTHER"));
      continue;
    }

    const kind = (c.woo_offer_kind || "").toLowerCase();
    if (kind === "variation") {
      // Product.wooCommerceId must equal Woo parent for variable offers.
      if (snap.productWooCommerceId == null || snap.productWooCommerceId !== c.woo_parent_id) {
        allReviews.push(toReview(sourceRow, "PARENT_MISMATCH"));
        continue;
      }
    } else if (kind === "simple") {
      // Simple: parent id is the product id; Product.wooCommerceId should match.
      if (snap.productWooCommerceId == null || snap.productWooCommerceId !== c.woo_offer_id) {
        // Allow parent field equal to offer when parent column mirrors product id.
        if (snap.productWooCommerceId !== c.woo_parent_id) {
          allReviews.push(toReview(sourceRow, "PARENT_MISMATCH"));
          continue;
        }
      }
    }

    if (snap.wooCommerceVariationId != null && snap.wooCommerceVariationId !== c.woo_offer_id) {
      allReviews.push(toReview(sourceRow, "EXISTING_ID_CONFLICT"));
      continue;
    }

    const owner = existingWooOfferOwners.get(c.woo_offer_id);
    if (owner && owner !== c.sarveda_variant_id) {
      allReviews.push(toReview(sourceRow, "WOO_ID_ALREADY_ASSIGNED"));
      continue;
    }

    const writeNeeded = snap.wooCommerceVariationId == null;
    if (!writeNeeded) alreadyCorrect += 1;
    else toWrite += 1;

    accepted.push({
      ...c,
      previous_wooCommerceVariationId: snap.wooCommerceVariationId,
      new_wooCommerceVariationId: c.woo_offer_id,
      writeNeeded
    });
  }

  return {
    accepted,
    reviews: allReviews,
    stats: {
      sourceRows: rows.length,
      highRows: counts.high,
      mediumRows: counts.medium,
      ambiguousRows: counts.ambiguous,
      unmatchedRows: counts.unmatched,
      parentOnlyRows: counts.parentOnly,
      conflictVariantRows: counts.conflictRows,
      preflightSafe: accepted.length,
      alreadyCorrect,
      toWrite,
      duplicateWooInAccepted: dupWoo.size,
      duplicateSarvedaInAccepted: dupSv.size
    }
  };
}

/** Reconstruct Merchant item id from stored variant offer identity. */
export function merchantIdFromWooOfferId(wooOfferId: number): string {
  return `gla_${wooOfferId}`;
}

export function continuityCheck(
  accepted: PreflightAccepted[]
): {
  exactMerchantMatches: number;
  merchantMismatches: Array<{ expected: string; calculated: string; woo_offer_id: number }>;
  itemGroupExact: number;
  itemGroupMismatch: Array<{
    woo_offer_id: number;
    merchant_item_group_id: string;
    woo_parent_id: number;
  }>;
  variableCount: number;
  simpleCount: number;
} {
  let exactMerchantMatches = 0;
  const merchantMismatches: Array<{ expected: string; calculated: string; woo_offer_id: number }> =
    [];
  let itemGroupExact = 0;
  const itemGroupMismatch: Array<{
    woo_offer_id: number;
    merchant_item_group_id: string;
    woo_parent_id: number;
  }> = [];
  let variableCount = 0;
  let simpleCount = 0;

  for (const row of accepted) {
    const calc = merchantIdFromWooOfferId(row.new_wooCommerceVariationId);
    if (calc === row.merchant_id) exactMerchantMatches += 1;
    else merchantMismatches.push({ expected: row.merchant_id, calculated: calc, woo_offer_id: row.woo_offer_id });

    const kind = (row.woo_offer_kind || "").toLowerCase();
    if (kind === "variation") {
      variableCount += 1;
      const group = String(row.merchant_item_group_id || "").trim();
      if (group && group === String(row.woo_parent_id)) itemGroupExact += 1;
      else
        itemGroupMismatch.push({
          woo_offer_id: row.woo_offer_id,
          merchant_item_group_id: group,
          woo_parent_id: row.woo_parent_id
        });
    } else if (kind === "simple") {
      simpleCount += 1;
      // Simple Merchant rows typically have empty item_group_id — not a parent mismatch.
    }
  }

  return {
    exactMerchantMatches,
    merchantMismatches,
    itemGroupExact,
    itemGroupMismatch,
    variableCount,
    simpleCount
  };
}
