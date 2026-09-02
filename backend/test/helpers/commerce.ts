import type { Request } from "express";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

import { assertDestructiveTestCleanupAllowed } from "./test-db-guard";

export const prisma = new PrismaClient();

export function mockRequest(opts?: {
  sessionId?: string;
  userId?: string;
  headers?: Record<string, string>;
}): Request {
  const headers: Record<string, string | string[] | undefined> = {
    ...(opts?.headers ?? {})
  };
  if (opts?.sessionId) {
    headers["x-sarveda-cart-session"] = opts.sessionId;
  }
  const req = {
    headers,
    authUser: opts?.userId ? { id: opts.userId, role: "CUSTOMER" } : undefined
  } as unknown as Request;
  return req;
}

export type TestProductBundle = {
  productId: string;
  variantId: string;
  sku: string;
  inventoryId: string;
};

let skuCounter = 0;

export async function createTestProductWithInventory(opts?: {
  onHand?: number;
  reserved?: number;
  saleInPaise?: number;
  mrpInPaise?: number;
  weightGrams?: number;
  dropShipEnabled?: boolean;
}): Promise<TestProductBundle> {
  skuCounter += 1;
  const suffix = `${Date.now()}-${skuCounter}-${randomUUID().slice(0, 8)}`;
  const sku = `TEST-SKU-${suffix}`;

  const product = await prisma.product.create({
    data: {
      slug: `test-product-${suffix}`,
      name: `Test Product ${suffix}`,
      status: "ACTIVE",
      productType: "SIMPLE",
      taxClass: "standard",
      hsnCode: "9205"
    }
  });

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku,
      mrpInPaise: opts?.mrpInPaise ?? 118_000,
      saleInPaise: opts?.saleInPaise ?? 118_000,
      weightGrams: opts?.weightGrams ?? 500,
      isDefault: true,
      status: "ACTIVE",
      dropShipEnabled: opts?.dropShipEnabled ?? false
    }
  });

  const inventory = await prisma.inventory.create({
    data: {
      variantId: variant.id,
      onHand: opts?.onHand ?? 100,
      reserved: opts?.reserved ?? 0,
      lowStockThreshold: 5
    }
  });

  return {
    productId: product.id,
    variantId: variant.id,
    sku,
    inventoryId: inventory.id
  };
}

export async function createGuestCartWithItem(variantId: string, quantity = 1) {
  const sessionId = randomUUID();
  const cart = await prisma.cart.create({
    data: {
      sessionId,
      items: {
        create: { variantId, quantity }
      }
    }
  });
  return { cartId: cart.id, sessionId };
}

export async function createPendingRazorpayOrder(bundle: TestProductBundle, opts?: {
  qty?: number;
  unitPriceInPaise?: number;
}) {
  const qty = opts?.qty ?? 1;
  const unitPrice = opts?.unitPriceInPaise ?? 118_000;
  const lineTotal = unitPrice * qty;
  const orderNumber = `SRV-TEST-${randomUUID().slice(0, 8)}`;
  const rzpOrderId = `order_test_${randomUUID().slice(0, 12)}`;

  const variant = await prisma.productVariant.findUnique({
    where: { id: bundle.variantId },
    include: { inventory: true }
  });
  const { getVariantFulfillmentAvailability, variantFulfillmentInputFromVariant, assertFulfillmentAllowed } =
    await import("../../src/modules/inventory/variant-fulfillment-availability");
  const allocation = assertFulfillmentAllowed(
    variantFulfillmentInputFromVariant(variant ?? { inventory: null }),
    qty
  );

  const order = await prisma.order.create({
    data: {
      orderNumber,
      email: `test-${randomUUID().slice(0, 8)}@example.com`,
      phone: "9876543210",
      status: "PENDING_PAYMENT",
      paymentStatus: "PENDING",
      subtotalInPaise: lineTotal,
      grandTotalInPaise: lineTotal,
      currency: "INR",
      items: {
        create: {
          variantId: bundle.variantId,
          skuSnapshot: bundle.sku,
          nameSnapshot: "Test Product",
          qtyOrdered: qty,
          warehouseFulfillmentQty: allocation.warehouseFulfillmentQty,
          dropShipFulfillmentQty: allocation.dropShipFulfillmentQty,
          unitPriceInPaise: unitPrice,
          lineTotalInPaise: lineTotal
        }
      },
      addresses: {
        create: [
          {
            type: "SHIPPING",
            fullName: "Test User",
            phone: "9876543210",
            line1: "123 Test Street",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560001",
            country: "IN"
          },
          {
            type: "BILLING",
            fullName: "Test User",
            phone: "9876543210",
            line1: "123 Test Street",
            city: "Bengaluru",
            state: "Karnataka",
            postalCode: "560001",
            country: "IN"
          }
        ]
      },
      payments: {
        create: {
          provider: "RAZORPAY",
          providerOrderId: rzpOrderId,
          amountInPaise: lineTotal,
          currency: "INR",
          status: "PENDING"
        }
      }
    },
    include: { payments: true, items: true }
  });

  const { reserveStockTx } = await import("../../src/modules/orders/orders.service");
  await prisma.$transaction(async (tx) => {
    await reserveStockTx(tx, order.id);
  });

  return {
    order,
    payment: order.payments[0]!,
    rzpOrderId,
    qty
  };
}

export async function cleanupTestOrder(orderId: string) {
  await prisma.orderInventoryRestockEvent.deleteMany({ where: { orderId } });
  await prisma.orderAttribution.deleteMany({ where: { orderId } });
  await prisma.refund.deleteMany({ where: { payment: { orderId } } });
  await prisma.payment.deleteMany({ where: { orderId } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
  await prisma.orderItem.deleteMany({ where: { orderId } });
  await prisma.orderAddress.deleteMany({ where: { orderId } });
  await prisma.invoice.deleteMany({ where: { orderId } });
  await prisma.deliveryChallanItem.deleteMany({
    where: { deliveryChallan: { orderId } }
  });
  await prisma.eWayBillItem.deleteMany({ where: { ewayBill: { orderId } } });
  await prisma.eWayBill.deleteMany({ where: { orderId } });
  await prisma.deliveryChallan.deleteMany({ where: { orderId } });
  await prisma.shipment.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
}

export async function cleanupTestProduct(bundle: TestProductBundle) {
  await prisma.inventory.deleteMany({ where: { id: bundle.inventoryId } });
  await prisma.productVariant.deleteMany({ where: { id: bundle.variantId } });
  await prisma.product.deleteMany({ where: { id: bundle.productId } });
}

export async function cleanupGuestCart(cartId: string) {
  await prisma.cartItem.deleteMany({ where: { cartId } });
  await prisma.cart.deleteMany({ where: { id: cartId } });
}

export async function getInventory(variantId: string) {
  return prisma.inventory.findUnique({ where: { variantId } });
}

export async function cleanupAccountingTestData() {
  assertDestructiveTestCleanupAllowed();

  await accountingCleanupMutex.run(async () => {
    // TRUNCATE bypasses row DELETE triggers on POSTED journals (test-only teardown).
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "AccountingInventoryCostConsumption",
        "AccountingInventoryCostLayer",
        "AccountingInventoryOpeningBatchItem",
        "AccountingInventoryOpeningBatch",
        "AccountingExpenseAccountMapping",
        "AccountingExpensePaymentMapping",
        "AccountingVendorPaymentAllocation",
        "AccountingVendorPayment",
        "AccountingBankStatementMatch",
        "AccountingBankStatementLine",
        "AccountingBankReconciliation",
        "AccountingBankStatementImport",
        "AccountingBankTransfer",
        "AccountingGatewaySettlementLine",
        "AccountingGatewaySettlement",
        "AccountingItcStatusHistory",
        "AccountingItcEvidence",
        "AccountingJournalLine",
        "AccountingDocumentLink",
        "AccountingPostingEvent",
        "AccountingJournalEntry",
        "AccountingBankAccount",
        "AccountingAuditLog",
        "AccountingPeriod"
      RESTART IDENTITY CASCADE
    `);
    await prisma.accountingSequence.deleteMany({});
  });
}

class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

const accountingCleanupMutex = new AsyncMutex();

export async function seedMinimalCoAForTests() {
  const existing = await prisma.accountingAccount.count();
  if (existing > 0) return;

  const { seedAccountingChartOfAccounts } = await import("../../src/modules/accounting/seed-coa");
  await seedAccountingChartOfAccounts();
}

export async function getAccountIdByCode(code: string): Promise<string> {
  const acct = await prisma.accountingAccount.findUnique({ where: { code } });
  if (!acct) throw new Error(`Missing test account ${code}`);
  return acct.id;
}
