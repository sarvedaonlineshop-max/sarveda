import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

export type StockRevisionReason =
  | "ADMIN_MANUAL"
  | "ORDER_CONFIRM"
  | "ORDER_RELEASE"
  | "REFUND_RESTOCK"
  | "IMPORT"
  | "ZOHO_SYNC"
  | "OTHER";

type RecordArgs = {
  variantId: string;
  previousOnHand: number;
  newOnHand: number;
  reason: StockRevisionReason;
  actorLabel?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  actorUserId?: string | null;
  note?: string | null;
  /** Optional preloaded labels — skips extra query when provided. */
  productName?: string;
  variantName?: string | null;
  sku?: string;
  tx?: Prisma.TransactionClient;
};

async function resolveVariantMeta(variantId: string, tx: Prisma.TransactionClient | typeof prisma) {
  const row = await tx.productVariant.findUnique({
    where: { id: variantId },
    select: {
      sku: true,
      productRel: { select: { name: true } },
      attributeValues: {
        take: 6,
        select: { attributeValue: { select: { value: true } } }
      }
    }
  });
  if (!row) return null;
  const variantName =
    row.attributeValues.map((a) => a.attributeValue.value).filter(Boolean).join(" / ") || null;
  return {
    sku: row.sku,
    productName: row.productRel.name,
    variantName
  };
}

/** Append a stock revision when onHand actually changes. Safe to call no-op when unchanged. */
export async function recordInventoryStockRevision(args: RecordArgs): Promise<void> {
  if (args.previousOnHand === args.newOnHand) return;
  const db = args.tx ?? prisma;
  const delta = args.newOnHand - args.previousOnHand;
  let productName = args.productName;
  let variantName = args.variantName ?? null;
  let sku = args.sku;
  if (!productName || !sku) {
    const meta = await resolveVariantMeta(args.variantId, db);
    if (!meta) return;
    productName = productName ?? meta.productName;
    variantName = variantName ?? meta.variantName;
    sku = sku ?? meta.sku;
  }
  await db.inventoryStockRevision.create({
    data: {
      variantId: args.variantId,
      productName: productName!,
      variantName,
      sku: sku!,
      previousOnHand: args.previousOnHand,
      newOnHand: args.newOnHand,
      increased: Math.max(0, delta),
      decreased: Math.max(0, -delta),
      reason: args.reason,
      actorLabel: args.actorLabel ?? null,
      orderId: args.orderId ?? null,
      orderNumber: args.orderNumber ?? null,
      actorUserId: args.actorUserId ?? null,
      note: args.note ?? null
    }
  });
}

export async function listInventoryStockRevisions(params: {
  page?: number;
  limit?: number;
  q?: string;
  variantId?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 50));
  const q = params.q?.trim();
  const where: Prisma.InventoryStockRevisionWhereInput = {
    ...(params.variantId ? { variantId: params.variantId } : {}),
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" } },
            { productName: { contains: q, mode: "insensitive" } },
            { variantName: { contains: q, mode: "insensitive" } },
            { orderNumber: { contains: q, mode: "insensitive" } },
            { actorLabel: { contains: q, mode: "insensitive" } }
          ]
        }
      : {})
  };
  const [total, items] = await prisma.$transaction([
    prisma.inventoryStockRevision.count({ where }),
    prisma.inventoryStockRevision.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit
    })
  ]);
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  };
}
