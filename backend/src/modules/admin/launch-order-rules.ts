/**
 * Launch cutover rules — which orders stay live vs archive vs delete.
 * Live admin Orders (post-cutover): SRV-ACCT-* accounting fixtures + website orders on/after cutover.
 */

/** India launch cutover — website orders on/after this instant are "live". */
export const LAUNCH_ORDER_CUTOVER_ISO = "2026-09-01T00:00:00+05:30";

export function launchOrderCutoverDate(): Date {
  const raw = process.env.LAUNCH_ORDER_CUTOVER_ISO?.trim() || LAUNCH_ORDER_CUTOVER_ISO;
  return new Date(raw);
}

/** Accounting UAT synthetic orders — keep in live Order table for posting tests. */
export function isAccountingFixtureOrderNumber(orderNumber: string): boolean {
  const n = orderNumber.toUpperCase();
  return n.startsWith("SRV-ACCT-") || n.includes("SRV-ACCT-");
}

/** Commerce / COGS validation orders — delete at cutover (journals may remain). */
export function isCommerceTestOrderNumber(orderNumber: string): boolean {
  const n = orderNumber.toUpperCase();
  return (
    n.startsWith("SRV-TEST-") ||
    (n.startsWith("SRV-") && !n.startsWith("SRV-ACCT-") && n.includes("TEST"))
  );
}

/** WooCommerce migrated legacy rows. */
export function isWooLegacyOrderNumber(orderNumber: string): boolean {
  return orderNumber.startsWith("WOO-");
}

/** Pre-cutover website checkout orders (SRV-YYYYMM*) — archive, do not delete. */
export function isPreLaunchWebsiteOrder(order: { orderNumber: string; placedAt: Date | null; createdAt: Date }): boolean {
  if (isAccountingFixtureOrderNumber(order.orderNumber)) return false;
  if (isCommerceTestOrderNumber(order.orderNumber)) return false;
  if (isWooLegacyOrderNumber(order.orderNumber)) return true;
  const at = order.placedAt ?? order.createdAt;
  return at < launchOrderCutoverDate();
}

export function isLiveAdminOrder(order: {
  orderNumber: string;
  placedAt: Date | null;
  createdAt: Date;
}): boolean {
  if (isAccountingFixtureOrderNumber(order.orderNumber)) return true;
  if (isCommerceTestOrderNumber(order.orderNumber)) return false;
  if (isWooLegacyOrderNumber(order.orderNumber)) return false;
  const at = order.placedAt ?? order.createdAt;
  return at >= launchOrderCutoverDate();
}

/** Product slug/SKU patterns for accounting test catalog fixtures. */
export function isAccountingTestProductSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  return s.startsWith("acct-prod-") || s.startsWith("test-acc-") || s.includes("acct-prod");
}

export function isAccountingTestProductSku(sku: string): boolean {
  const s = sku.toUpperCase();
  return s.startsWith("ACCT-SKU-") || s.startsWith("TEST-ACC-") || s.startsWith("TEST-SKU-");
}

/** Dedupe key for D2C order when merging into LegacyOrderArchive. */
export function legacyDedupeKeyD2C(orderNumber: string): string {
  return `d2c:${orderNumber}`;
}

/** Dedupe key for marketplace row. */
export function legacyDedupeKeyMarketplace(channelCode: string, externalOrderId: string): string {
  return `mp:${channelCode}:${externalOrderId}`;
}

/**
 * Marketplace row skipped when it duplicates a D2C order already archived.
 * Matches external id to order number, or shared Zoho invoice id.
 */
export function marketplaceOverlapsD2C(
  mp: { externalOrderId: string; channelCode: string },
  d2cKeys: Set<string>,
  d2cZohoIds: Set<string>,
  mpZohoId?: string | null
): boolean {
  const ext = mp.externalOrderId.trim();
  if (d2cKeys.has(ext)) return true;
  if (d2cKeys.has(`d2c:${ext}`)) return true;
  if (mp.channelCode === "SARVEDA" && d2cKeys.has(`d2c:${ext}`)) return true;
  if (mpZohoId && d2cZohoIds.has(mpZohoId)) return true;
  return false;
}
