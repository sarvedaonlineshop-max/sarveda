import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingSalesPostingDisabledError,
  OrderNotEligibleForPostingError,
  OrderPaidJournalImbalanceError
} from "../../src/modules/accounting/accounting-errors";
import { buildOrderPaidJournal } from "../../src/modules/accounting/order-paid-journal.builder";
import type { OrderPaidSnapshot } from "../../src/modules/accounting/order-paid-journal.types";
import {
  ACCOUNT_CODE,
  CLEARING_ACCOUNT_BY_PROVIDER,
  ORDER_PAID_CALC_VERSION
} from "../../src/modules/accounting/order-paid.constants";
import { isOrderEligibleForOrderPaidPosting } from "../../src/modules/accounting/order-eligibility";
import {
  cleanupAccountingTestData,
  getAccountIdByCode,
  prisma
} from "../helpers/commerce";
import {
  cleanupSyntheticPaidOrder,
  createSyntheticPaidOrder
} from "../helpers/accounting-orders";
import { loadOrderPaidSnapshotById } from "../../src/modules/accounting/order-snapshot.service";
import {
  postOrderPaidJournal,
  previewOrderPaidJournal
} from "../../src/modules/accounting/order-paid-posting.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";

function baseSnapshot(overrides: Partial<OrderPaidSnapshot> = {}): OrderPaidSnapshot {
  return {
    orderId: "00000000-0000-4000-8000-000000000099",
    orderNumber: "SRV-TEST-0001",
    placedAt: new Date("2026-08-22"),
    currency: "INR",
    status: "PAID",
    subtotalInPaise: 118_000,
    discountInPaise: 0,
    shippingInPaise: 0,
    grandTotalInPaise: 118_000,
    shippingCountry: "IN",
    shippingState: "Karnataka",
    payment: {
      id: "pay-1",
      provider: "RAZORPAY",
      status: "CAPTURED",
      amountInPaise: 118_000
    },
    lines: [
      {
        orderItemId: "line-1",
        skuSnapshot: "SKU-1",
        nameSnapshot: "Test Item",
        qtyOrdered: 1,
        unitPriceInPaise: 118_000,
        lineTotalInPaise: 118_000,
        taxClass: "standard"
      }
    ],
    ...overrides
  };
}

describe("buildOrderPaidJournal — ORDER_PAID_V1", () => {
  it("A. Razorpay intra-state, no discount", () => {
    const proposal = buildOrderPaidJournal(baseSnapshot());
    expect(proposal.calcVersion).toBe(ORDER_PAID_CALC_VERSION);
    expect(proposal.balanced).toBe(true);
    expect(proposal.lines[0]?.accountCode).toBe(CLEARING_ACCOUNT_BY_PROVIDER.RAZORPAY);
    expect(proposal.lines[0]?.debitInPaise).toBe(118_000);
    expect(proposal.diagnostics.outputCgstPaise).toBeGreaterThan(0);
    expect(proposal.diagnostics.outputSgstPaise).toBeGreaterThan(0);
    expect(proposal.diagnostics.outputIgstPaise).toBe(0);
  });

  it("B. Razorpay intra-state + discount", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        discountInPaise: 10_000,
        grandTotalInPaise: 108_000,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 108_000 }
      })
    );
    expect(proposal.balanced).toBe(true);
    const discountLine = proposal.lines.find((l) => l.accountCode === ACCOUNT_CODE.DISCOUNTS_CONTRA);
    expect(discountLine?.debitInPaise).toBeGreaterThan(0);
    expect(proposal.diagnostics.discountTaxableContraPaise).toBeLessThan(10_000);
  });

  it("C. Razorpay inter-state + discount", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        shippingState: "Maharashtra",
        discountInPaise: 5_000,
        grandTotalInPaise: 113_000,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 113_000 }
      })
    );
    expect(proposal.diagnostics.interState).toBe(true);
    expect(proposal.diagnostics.outputIgstPaise).toBeGreaterThan(0);
    expect(proposal.balanced).toBe(true);
  });

  it("D. Stripe", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        payment: { id: "p", provider: "STRIPE", status: "CAPTURED", amountInPaise: 118_000 }
      })
    );
    expect(proposal.lines[0]?.accountCode).toBe(ACCOUNT_CODE.STRIPE_CLEARING);
  });

  it("E. PayPal", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        payment: { id: "p", provider: "PAYPAL", status: "CAPTURED", amountInPaise: 118_000 }
      })
    );
    expect(proposal.lines[0]?.accountCode).toBe(ACCOUNT_CODE.PAYPAL_CLEARING);
  });

  it("F. COD debits AR not cash", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        payment: { id: "p", provider: "COD", status: "PENDING", amountInPaise: 118_000 }
      })
    );
    expect(proposal.lines[0]?.accountCode).toBe(ACCOUNT_CODE.ACCOUNTS_RECEIVABLE);
  });

  it("G. no shipping", () => {
    const proposal = buildOrderPaidJournal(baseSnapshot({ shippingInPaise: 0 }));
    expect(proposal.lines.some((l) => l.accountCode === ACCOUNT_CODE.SHIPPING_INCOME)).toBe(false);
  });

  it("H. with shipping", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        shippingInPaise: 5_000,
        grandTotalInPaise: 123_000,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 123_000 }
      })
    );
    const ship = proposal.lines.find((l) => l.accountCode === ACCOUNT_CODE.SHIPPING_INCOME);
    expect(ship?.creditInPaise).toBe(5_000);
  });

  it("I. multiple line items", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        subtotalInPaise: 223_000,
        grandTotalInPaise: 223_000,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 223_000 },
        lines: [
          {
            orderItemId: "l1",
            skuSnapshot: "A",
            nameSnapshot: "A",
            qtyOrdered: 1,
            unitPriceInPaise: 118_000,
            lineTotalInPaise: 118_000,
            taxClass: "standard"
          },
          {
            orderItemId: "l2",
            skuSnapshot: "B",
            nameSnapshot: "B",
            qtyOrdered: 1,
            unitPriceInPaise: 105_000,
            lineTotalInPaise: 105_000,
            taxClass: "gst12"
          }
        ]
      })
    );
    expect(proposal.diagnostics.lineAllocations).toHaveLength(2);
    expect(proposal.balanced).toBe(true);
  });

  it("J. multiple GST rates", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        subtotalInPaise: 223_000,
        grandTotalInPaise: 223_000,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 223_000 },
        lines: [
          {
            orderItemId: "l1",
            skuSnapshot: "A",
            nameSnapshot: "A",
            qtyOrdered: 1,
            unitPriceInPaise: 118_000,
            lineTotalInPaise: 118_000,
            taxClass: "standard"
          },
          {
            orderItemId: "l2",
            skuSnapshot: "B",
            nameSnapshot: "B",
            qtyOrdered: 1,
            unitPriceInPaise: 105_000,
            lineTotalInPaise: 105_000,
            taxClass: "gst-5"
          }
        ]
      })
    );
    expect(proposal.diagnostics.lineAllocations[0]?.gstRatePercent).toBe(18);
    expect(proposal.diagnostics.lineAllocations[1]?.gstRatePercent).toBe(5);
  });

  it("K. quantity > 1", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        subtotalInPaise: 236_000,
        grandTotalInPaise: 236_000,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 236_000 },
        lines: [
          {
            orderItemId: "l1",
            skuSnapshot: "A",
            nameSnapshot: "A",
            qtyOrdered: 2,
            unitPriceInPaise: 118_000,
            lineTotalInPaise: 236_000,
            taxClass: "standard"
          }
        ]
      })
    );
    expect(proposal.balanced).toBe(true);
  });

  it("L. odd-paise discount", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        discountInPaise: 333,
        grandTotalInPaise: 117_667,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 117_667 }
      })
    );
    expect(proposal.balanced).toBe(true);
  });

  it("M. allocation remainder on last line", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        subtotalInPaise: 200_003,
        discountInPaise: 7,
        grandTotalInPaise: 199_996,
        payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 199_996 },
        lines: [
          {
            orderItemId: "l1",
            skuSnapshot: "A",
            nameSnapshot: "A",
            qtyOrdered: 1,
            unitPriceInPaise: 100_001,
            lineTotalInPaise: 100_001,
            taxClass: "standard"
          },
          {
            orderItemId: "l2",
            skuSnapshot: "B",
            nameSnapshot: "B",
            qtyOrdered: 1,
            unitPriceInPaise: 100_002,
            lineTotalInPaise: 100_002,
            taxClass: "standard"
          }
        ]
      })
    );
    const last = proposal.diagnostics.lineAllocations[1];
    expect(last?.discountPaise).toBeGreaterThan(0);
    expect(proposal.balanced).toBe(true);
  });

  it("N. international / non-GST", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        currency: "USD",
        shippingCountry: "US",
        shippingState: "CA",
        payment: { id: "p", provider: "STRIPE", status: "CAPTURED", amountInPaise: 118_000 }
      })
    );
    expect(proposal.diagnostics.isGstApplicable).toBe(false);
    expect(proposal.balanced).toBe(true);
  });

  it("Q. missing address — eligibility fails", () => {
    const snap = baseSnapshot({ shippingCountry: "" });
    expect(isOrderEligibleForOrderPaidPosting(snap).eligible).toBe(false);
  });

  it("Q2. REFUNDED payment still eligible for historical ORDER_PAID shadow", () => {
    const snap = baseSnapshot({
      status: "REFUNDED",
      payment: { id: "p", provider: "RAZORPAY", status: "REFUNDED", amountInPaise: 118_000 }
    });
    expect(isOrderEligibleForOrderPaidPosting(snap).eligible).toBe(true);
  });

  it("R. missing taxClass defaults to standard rate", () => {
    const proposal = buildOrderPaidJournal(
      baseSnapshot({
        lines: [
          {
            orderItemId: "l1",
            skuSnapshot: "A",
            nameSnapshot: "A",
            qtyOrdered: 1,
            unitPriceInPaise: 118_000,
            lineTotalInPaise: 118_000,
            taxClass: null
          }
        ]
      })
    );
    expect(proposal.diagnostics.lineAllocations[0]?.gstRatePercent).toBe(18);
  });

  it("T. imbalance > 2 paise fails closed", () => {
    expect(() =>
      buildOrderPaidJournal(
        baseSnapshot({
          grandTotalInPaise: 100_000,
          payment: { id: "p", provider: "RAZORPAY", status: "CAPTURED", amountInPaise: 100_000 }
        })
      )
    ).toThrow(OrderPaidJournalImbalanceError);
  });
});

describe("ORDER_PAID integration — discovery posting", () => {
  const createdOrderIds: string[] = [];
  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalSales = process.env.ACCOUNTING_SALES_POSTING_ENABLED;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
  });

  afterEach(async () => {
    for (const id of createdOrderIds.splice(0)) {
      await cleanupSyntheticPaidOrder(id);
    }
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = originalSales ?? "0";
  });

  it("O/P. duplicate and concurrent discovery post same order once", async () => {
    const order = await createSyntheticPaidOrder({
      provider: "RAZORPAY",
      discountInPaise: 2_000,
      shippingInPaise: 5_000
    });
    createdOrderIds.push(order.id);

    const snapshot = await loadOrderPaidSnapshotById(order.id);
    const attempts = await Promise.all(
      Array.from({ length: 20 }, () => postOrderPaidJournal(snapshot))
    );

    const posted = attempts.filter((a) => !a.duplicate);
    expect(posted).toHaveLength(1);

    const events = await prisma.accountingPostingEvent.findMany({
      where: { eventType: "ORDER_PAID", sourceId: order.id }
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("POSTED");

    const journals = await prisma.accountingJournalEntry.findMany({
      where: { postingEvent: { sourceId: order.id } }
    });
    expect(journals).toHaveLength(1);
  });

  it("W. already posted order returns duplicate", async () => {
    const order = await createSyntheticPaidOrder({ provider: "STRIPE" });
    createdOrderIds.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    const first = await postOrderPaidJournal(snapshot);
    expect(first.duplicate).toBe(false);
    const second = await postOrderPaidJournal(snapshot);
    expect(second.duplicate).toBe(true);
  });

  it("X. cancelled unpaid order not eligible", async () => {
    const order = await createSyntheticPaidOrder({
      status: "CANCELLED",
      paymentStatus: "PENDING",
      provider: "RAZORPAY"
    });
    createdOrderIds.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await expect(postOrderPaidJournal(snapshot)).rejects.toBeInstanceOf(
      OrderNotEligibleForPostingError
    );
  });

  it("Y. failed payment not eligible", async () => {
    const order = await createSyntheticPaidOrder({
      provider: "RAZORPAY",
      paymentStatus: "PENDING",
      status: "PAID"
    });
    createdOrderIds.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    const preview = await previewOrderPaidJournal(snapshot);
    expect(preview.eligibility.eligible).toBe(false);
  });

  it("U/V. sales posting flag off blocks persistence", async () => {
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "0";
    const order = await createSyntheticPaidOrder();
    createdOrderIds.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    await expect(postOrderPaidJournal(snapshot)).rejects.toBeInstanceOf(
      AccountingSalesPostingDisabledError
    );
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
  });

  it("creates AccountingDocumentLink ORDER → journal", async () => {
    const order = await createSyntheticPaidOrder({ provider: "PAYPAL" });
    createdOrderIds.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    const result = await postOrderPaidJournal(snapshot);
    const link = await prisma.accountingDocumentLink.findFirst({
      where: { documentType: "ORDER", documentId: order.id }
    });
    expect(link?.journalEntryId).toBe(result.journal.id);
  });

  it("COD posts to AR with PENDING payment", async () => {
    const order = await createSyntheticPaidOrder({ provider: "COD" });
    createdOrderIds.push(order.id);
    const snapshot = await loadOrderPaidSnapshotById(order.id);
    const preview = await previewOrderPaidJournal(snapshot);
    expect(preview.eligibility.eligible).toBe(true);
    expect(preview.proposal?.lines[0]?.accountCode).toBe("1100");
    await postOrderPaidJournal(snapshot);
    await getAccountIdByCode("1100");
  });
});
