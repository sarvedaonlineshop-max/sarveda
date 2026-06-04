import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { gstRatePercent } from "../../utils/gst";

import { zohoGet, zohoPost, zohoPut } from "./zoho-client";

type ZohoItemRow = {
  item_id: string;
  sku?: string;
  name?: string;
};

export type ZohoProductSyncResult = {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function zohoConfigured(): boolean {
  return Boolean(
    process.env.ZOHO_CLIENT_ID?.trim() &&
      process.env.ZOHO_REFRESH_TOKEN?.trim() &&
      process.env.ZOHO_ORGANIZATION_ID?.trim()
  );
}

async function findZohoItemBySku(sku: string): Promise<ZohoItemRow | null> {
  try {
    const res = await zohoGet<{ items: ZohoItemRow[] }>(
      `/items?sku=${encodeURIComponent(sku)}&filter_by=Status.Active`
    );
    const hit = (res.items ?? []).find((i) => i.sku?.trim() === sku);
    return hit ?? null;
  } catch {
    return null;
  }
}

function buildItemPayload(opts: {
  name: string;
  sku: string;
  rateInr: number;
  description?: string | null;
  taxPercent: number;
}) {
  const body: Record<string, unknown> = {
    name: opts.name.slice(0, 100),
    sku: opts.sku.slice(0, 120),
    rate: opts.rateInr,
    description: (opts.description ?? "").slice(0, 2000) || undefined,
    product_type: "goods",
    item_type: "sales_and_purchases",
    is_taxable: opts.taxPercent > 0
  };

  const taxId = process.env.ZOHO_SALES_TAX_ID?.trim();
  if (taxId && opts.taxPercent > 0) {
    body.tax_id = taxId;
    body.tax_percentage = opts.taxPercent;
  }

  return body;
}

async function upsertVariantToZoho(variant: {
  id: string;
  sku: string;
  saleInPaise: number;
  zohoItemId: string | null;
  productRel: { name: string; shortDescription: string | null; taxClass: string | null };
}): Promise<"created" | "updated" | "skipped"> {
  const sku = variant.sku.trim();
  if (!sku) return "skipped";

  const rateInr = variant.saleInPaise / 100;
  const taxPercent = gstRatePercent(variant.productRel.taxClass);
  const payload = buildItemPayload({
    name: variant.productRel.name,
    sku,
    rateInr,
    description: variant.productRel.shortDescription,
    taxPercent
  });

  if (variant.zohoItemId) {
    await zohoPut(`/items/${variant.zohoItemId}`, payload);
    return "updated";
  }

  const existing = await findZohoItemBySku(sku);
  if (existing?.item_id) {
    await zohoPut(`/items/${existing.item_id}`, payload);
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { zohoItemId: existing.item_id }
    });
    return "updated";
  }

  const created = await zohoPost<{ item: ZohoItemRow }>("/items", payload);
  const itemId = created.item?.item_id;
  if (itemId) {
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { zohoItemId: itemId }
    });
  }
  return "created";
}

/** Push all active variants for a product to Zoho Books as inventory items (SKU = unique key). */
export async function syncProductVariantsToZoho(productId: string): Promise<ZohoProductSyncResult> {
  const result: ZohoProductSyncResult = {
    ok: true,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  if (!zohoConfigured()) {
    result.ok = false;
    result.errors.push("Zoho Books is not configured on the server");
    return result;
  }

  const variants = await prisma.productVariant.findMany({
    where: { productId, status: "ACTIVE" },
    include: {
      productRel: { select: { name: true, shortDescription: true, taxClass: true } }
    }
  });

  for (const v of variants) {
    try {
      const action = await upsertVariantToZoho(v);
      if (action === "created") result.created++;
      else if (action === "updated") result.updated++;
      else result.skipped++;
    } catch (err) {
      result.ok = false;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${v.sku}: ${msg}`);
      logger.error("zoho_item_sync_failed", { productId, sku: v.sku, error: msg });
    }
  }

  logger.info("zoho_product_items_sync", { productId, ...result });
  return result;
}

export async function resolveZohoItemIdForSku(sku: string): Promise<string | null> {
  const variant = await prisma.productVariant.findFirst({
    where: { sku },
    select: { zohoItemId: true }
  });
  if (variant?.zohoItemId) return variant.zohoItemId;
  const hit = await findZohoItemBySku(sku);
  return hit?.item_id ?? null;
}
