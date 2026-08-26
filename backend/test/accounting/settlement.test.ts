import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  AccountingSettlementPostingDisabledError,
  SettlementMismatchError,
  SettlementNotEligibleForPostingError
} from "../../src/modules/accounting/accounting-errors";
import { ACCOUNT_CODE } from "../../src/modules/accounting/order-paid.constants";
import {
  assertSettlementPostingPersistenceAllowed,
  resolveSettlementDiscoveryDryRun
} from "../../src/modules/accounting/production-guard";
import {
  RAZORPAY_SETTLEMENT_ADAPTER_FORBIDDEN_METHODS,
  type RazorpaySettlementReadClient
} from "../../src/modules/accounting/razorpay-settlement.adapter";
import { buildPaymentGatewaySettledJournal } from "../../src/modules/accounting/settlement-journal.builder";
import {
  buildImportBundleFromParts,
  persistSettlementImport
} from "../../src/modules/accounting/settlement-import.service";
import {
  postRazorpaySettlement,
  previewRazorpaySettlement
} from "../../src/modules/accounting/settlement-posting.service";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";
import { buildReconciliationV3Row } from "../../src/modules/accounting/reconciliation.service";
import { loadOrderPaidSnapshotById } from "../../src/modules/accounting/order-snapshot.service";
import { postOrderPaidJournal } from "../../src/modules/accounting/order-paid-posting.service";
import { cleanupAccountingTestData, prisma } from "../helpers/commerce";
import {
  cleanupSyntheticPaidOrder,
  createSyntheticPaidOrder
} from "../helpers/accounting-orders";

function mockClient(opts: {
  settlementId: string;
  amount: number;
  fee?: number;
  tax?: number;
  utr?: string | null;
  created_at?: number;
  currency?: string;
  lines: Array<Record<string, unknown>>;
}): RazorpaySettlementReadClient {
  const header = {
    id: opts.settlementId,
    entity: "settlement",
    amount: opts.amount,
    status: "processed",
    fees: 0,
    tax: 0,
    utr: opts.utr === undefined ? "UTRTEST123" : opts.utr,
    created_at: opts.created_at ?? Math.floor(Date.now() / 1000)
  };
  const reconLines = opts.lines.map((l) => ({
    currency: opts.currency ?? "INR",
    settlement_id: opts.settlementId,
    settlement_utr: header.utr,
    settled: true,
    ...l
  }));

  return {
    async listSettlements() {
      return [header];
    },
    async fetchSettlement(id: string) {
      if (id !== opts.settlementId) throw new Error("not found");
      return header;
    },
    async fetchSettlementRecon() {
      return reconLines as never;
    }
  };
}

describe("PAYMENT_GATEWAY_SETTLED_V1", () => {
  const createdOrders: string[] = [];
  const originalNative = process.env.NATIVE_ACCOUNTING_ENABLED;
  const originalSales = process.env.ACCOUNTING_SALES_POSTING_ENABLED;
  const originalSettlement = process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED;

  beforeAll(async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = "1";
    process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "1";
    delete process.env.ACCOUNTING_PRODUCTION_POSTING_ALLOWED;
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
    process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "1";
    process.env.NATIVE_ACCOUNTING_ENABLED = "1";
  });

  afterEach(async () => {
    for (const id of createdOrders.splice(0)) {
      await cleanupSyntheticPaidOrder(id);
    }
    await prisma.accountingGatewaySettlement.deleteMany({});
  });

  afterAll(() => {
    process.env.NATIVE_ACCOUNTING_ENABLED = originalNative ?? "0";
    process.env.ACCOUNTING_SALES_POSTING_ENABLED = originalSales ?? "0";
    process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = originalSettlement ?? "0";
  });

  it("1. one-payment settlement journal: Dr Bank N, Dr 5100 F+T, Cr Clearing G", async () => {
    const order = await createSyntheticPaidOrder({
      lines: [{ unitPriceInPaise: 100_000, qtyOrdered: 1 }]
    });
    createdOrders.push(order.id);
    const snap = await loadOrderPaidSnapshotById(order.id);
    await postOrderPaidJournal(snap);

    const payId = order.payments[0]!.providerPaymentId!;
    const client = mockClient({
      settlementId: "setl_TEST_ONE",
      amount: 97_100,
      lines: [
        {
          entity_id: payId,
          type: "payment",
          amount: 100_000,
          fee: 2_500,
          tax: 400,
          debit: 0,
          credit: 97_100
        }
      ]
    });

    const preview = await previewRazorpaySettlement("setl_TEST_ONE", { client });
    expect(preview.proposal?.balanced).toBe(true);
    expect(preview.proposal?.diagnostics.feeAndTaxExpensedPaise).toBe(2_900);
    expect(preview.proposal?.diagnostics.gstItcStatus).toContain("UNVERIFIED");

    const lines = preview.proposal!.lines;
    expect(lines.find((l) => l.accountCode === ACCOUNT_CODE.BANK)?.debitInPaise).toBe(97_100);
    expect(lines.find((l) => l.accountCode === ACCOUNT_CODE.GATEWAY_CHARGES)?.debitInPaise).toBe(
      2_900
    );
    expect(
      lines.find((l) => l.accountCode === ACCOUNT_CODE.RAZORPAY_CLEARING)?.creditInPaise
    ).toBe(100_000);

    const post = await postRazorpaySettlement("setl_TEST_ONE", { client });
    expect(post.duplicate).toBe(false);
    expect(post.journal.totalDebitInPaise).toBe(post.journal.totalCreditInPaise);

    const recon = await buildReconciliationV3Row(order.id);
    expect(recon.settlement.allocations.length).toBe(1);
    expect(["MATCHED", "PARTIALLY_SETTLED", "UNSETTLED"]).toContain(recon.settlement.status);
  });

  it("2. multi-payment settlement", async () => {
    const o1 = await createSyntheticPaidOrder({ lines: [{ unitPriceInPaise: 50_000, qtyOrdered: 1 }] });
    const o2 = await createSyntheticPaidOrder({ lines: [{ unitPriceInPaise: 50_000, qtyOrdered: 1 }] });
    createdOrders.push(o1.id, o2.id);
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(o1.id));
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(o2.id));

    const client = mockClient({
      settlementId: "setl_TEST_MULTI",
      amount: 97_100,
      lines: [
        {
          entity_id: o1.payments[0]!.providerPaymentId!,
          type: "payment",
          amount: 50_000,
          fee: 1_250,
          tax: 200,
          debit: 0,
          credit: 48_550
        },
        {
          entity_id: o2.payments[0]!.providerPaymentId!,
          type: "payment",
          amount: 50_000,
          fee: 1_250,
          tax: 200,
          debit: 0,
          credit: 48_550
        }
      ]
    });

    const preview = await previewRazorpaySettlement("setl_TEST_MULTI", { client });
    expect(preview.summary.paymentCount).toBe(2);
    expect(preview.proposal?.diagnostics.paymentClearingReleasePaise).toBe(100_000);
    expect(preview.proposal?.balanced).toBe(true);
  });

  it("3. payment + refund settlement", async () => {
    const order = await createSyntheticPaidOrder({
      lines: [{ unitPriceInPaise: 100_000, qtyOrdered: 1 }]
    });
    createdOrders.push(order.id);
    const payId = order.payments[0]!.providerPaymentId!;
    const refund = await prisma.refund.create({
      data: {
        paymentId: order.payments[0]!.id,
        amountInPaise: 20_000,
        status: "processed",
        providerRefundId: "rfnd_TEST_SETTLE_1",
        reason: "TEST-ACC-SETTLEMENT"
      }
    });

    const client = mockClient({
      settlementId: "setl_TEST_REFUND",
      amount: 77_100,
      lines: [
        {
          entity_id: payId,
          type: "payment",
          amount: 100_000,
          fee: 2_500,
          tax: 400,
          debit: 0,
          credit: 97_100
        },
        {
          entity_id: refund.providerRefundId!,
          type: "refund",
          amount: 20_000,
          fee: 0,
          tax: 0,
          debit: 20_000,
          credit: 0,
          payment_id: payId
        }
      ]
    });

    const preview = await previewRazorpaySettlement("setl_TEST_REFUND", { client });
    expect(preview.proposal?.diagnostics.refundClearingRecoveryPaise).toBe(20_000);
    expect(preview.proposal?.balanced).toBe(true);
    const clearingDr = preview.proposal!.lines.filter(
      (l) => l.accountCode === ACCOUNT_CODE.RAZORPAY_CLEARING && l.debitInPaise > 0
    );
    expect(clearingDr[0]?.debitInPaise).toBe(20_000);
  });

  it("4–5. fee+tax and odd paise within tolerance", () => {
    const bundle = buildImportBundleFromParts({
      header: {
        id: "setl_ODD",
        amount: 97_099,
        created_at: Math.floor(Date.now() / 1000),
        utr: "UTR1"
      },
      reconLines: [],
      mappedLines: [
        {
          lineType: "PAYMENT",
          providerEntityId: "pay_x",
          amountInPaise: 100_000,
          feeInPaise: 2_500,
          taxInPaise: 401,
          debitInPaise: 0,
          creditInPaise: 97_099,
          providerPaymentId: "pay_x",
          providerRefundId: null,
          paymentId: null,
          orderId: null,
          mappingStatus: "UNMAPPED_PAYMENT",
          rawPayload: {},
          sortOrder: 0
        }
      ]
    });
    // 100000 - 2500 - 401 = 97099 exact
    const proposal = buildPaymentGatewaySettledJournal(bundle, { failOnImbalance: false });
    expect(proposal.diagnostics.arithmeticIdentityHolds).toBe(true);
    expect(proposal.diagnostics.feeTaxMode).toBe("TAX_EXCLUSIVE");
    expect(proposal.diagnostics.feeAndTaxExpensedPaise).toBe(2_901);

    // Real Razorpay often nests GST inside fee: G - F = N with tax informational
    const feeInclusive = buildImportBundleFromParts({
      header: {
        id: "setl_FEE_INCL",
        amount: 207_596,
        created_at: Math.floor(Date.now() / 1000),
        utr: "UTR_FEE_INCL"
      },
      reconLines: [],
      mappedLines: [
        {
          lineType: "PAYMENT",
          providerEntityId: "pay_y",
          amountInPaise: 213_000,
          feeInPaise: 5_404,
          taxInPaise: 824,
          debitInPaise: 0,
          creditInPaise: 207_596,
          providerPaymentId: "pay_y",
          providerRefundId: null,
          paymentId: null,
          orderId: null,
          mappingStatus: "UNMAPPED_PAYMENT",
          rawPayload: {},
          sortOrder: 0
        }
      ]
    });
    const incl = buildPaymentGatewaySettledJournal(feeInclusive, { failOnImbalance: false });
    expect(incl.diagnostics.feeTaxMode).toBe("FEE_INCLUSIVE_OF_TAX");
    expect(incl.diagnostics.feeAndTaxExpensedPaise).toBe(5_404);
    expect(incl.diagnostics.taxInPaise).toBe(824);
    expect(incl.balanced).toBe(true);
  });

  it("6–7. duplicate import and duplicate post", async () => {
    const order = await createSyntheticPaidOrder({ lines: [{ unitPriceInPaise: 10_000, qtyOrdered: 1 }] });
    createdOrders.push(order.id);
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(order.id));
    const payId = order.payments[0]!.providerPaymentId!;
    const client = mockClient({
      settlementId: "setl_DUP",
      amount: 9_710,
      lines: [
        {
          entity_id: payId,
          type: "payment",
          amount: 10_000,
          fee: 250,
          tax: 40,
          debit: 0,
          credit: 9_710
        }
      ]
    });

    const a = await persistSettlementImport(
      (
        await previewRazorpaySettlement("setl_DUP", { client, persistEvidence: false })
      ).bundle
    );
    const b = await persistSettlementImport(a.bundle);
    expect(b.created).toBe(false);

    const p1 = await postRazorpaySettlement("setl_DUP", { client });
    const p2 = await postRazorpaySettlement("setl_DUP", { client });
    expect(p2.duplicate).toBe(true);
    expect(p2.journal.entryNumber).toBe(p1.journal.entryNumber);
  });

  it("8. 20 concurrent posts → 1 journal", async () => {
    const order = await createSyntheticPaidOrder({ lines: [{ unitPriceInPaise: 10_000, qtyOrdered: 1 }] });
    createdOrders.push(order.id);
    await postOrderPaidJournal(await loadOrderPaidSnapshotById(order.id));
    const payId = order.payments[0]!.providerPaymentId!;
    const client = mockClient({
      settlementId: "setl_CONCUR",
      amount: 9_710,
      lines: [
        {
          entity_id: payId,
          type: "payment",
          amount: 10_000,
          fee: 250,
          tax: 40,
          debit: 0,
          credit: 9_710
        }
      ]
    });
    await previewRazorpaySettlement("setl_CONCUR", { client });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => postRazorpaySettlement("setl_CONCUR", { client }))
    );
    const entryNumbers = new Set(results.map((r) => r.journal.entryNumber));
    expect(entryNumbers.size).toBe(1);
    expect(results.filter((r) => !r.duplicate).length).toBeLessThanOrEqual(1);
  });

  it("9–11. unknown pay_/rfnd_/adjustment fail closed on post", async () => {
    const client = mockClient({
      settlementId: "setl_UNKNOWN",
      amount: 97_100,
      lines: [
        {
          entity_id: "pay_DOES_NOT_EXIST",
          type: "payment",
          amount: 100_000,
          fee: 2_500,
          tax: 400,
          debit: 0,
          credit: 97_100
        },
        {
          entity_id: "adj_X",
          type: "adjustment",
          amount: 100,
          fee: 0,
          tax: 0,
          debit: 0,
          credit: 100
        }
      ]
    });
    const preview = await previewRazorpaySettlement("setl_UNKNOWN", { client });
    expect(preview.summary.unmappedCount).toBeGreaterThan(0);
    await expect(postRazorpaySettlement("setl_UNKNOWN", { client })).rejects.toBeInstanceOf(
      SettlementNotEligibleForPostingError
    );
  });

  it("12–15. malformed / mismatch / missing UTR / missing date", async () => {
    expect(() =>
      buildImportBundleFromParts({
        header: { id: "setl_NODATE", amount: 100, created_at: 0, utr: "x" },
        reconLines: [],
        mappedLines: []
      })
    ).toThrow(/Settlement date/);

    const order = await createSyntheticPaidOrder({
      lines: [{ unitPriceInPaise: 10_000, qtyOrdered: 1 }]
    });
    createdOrders.push(order.id);
    const payId = order.payments[0]!.providerPaymentId!;
    const noUtr = mockClient({
      settlementId: "setl_NOUTR",
      amount: 9_710,
      utr: null,
      lines: [
        {
          entity_id: payId,
          type: "payment",
          amount: 10_000,
          fee: 250,
          tax: 40,
          debit: 0,
          credit: 9_710
        }
      ]
    });
    await previewRazorpaySettlement("setl_NOUTR", { client: noUtr });
    await expect(postRazorpaySettlement("setl_NOUTR", { client: noUtr })).rejects.toMatchObject({
      code: "MISSING_UTR"
    });

    const client = mockClient({
      settlementId: "setl_MISMATCH",
      amount: 9_710,
      lines: [
        {
          entity_id: payId,
          type: "payment",
          amount: 10_000,
          fee: 250,
          tax: 40,
          debit: 0,
          credit: 9_710
        }
      ]
    });
    await previewRazorpaySettlement("setl_MISMATCH", { client });
    const changed = mockClient({
      settlementId: "setl_MISMATCH",
      amount: 9_000,
      lines: [
        {
          entity_id: payId,
          type: "payment",
          amount: 10_000,
          fee: 800,
          tax: 200,
          debit: 0,
          credit: 9_000
        }
      ]
    });
    await expect(previewRazorpaySettlement("setl_MISMATCH", { client: changed })).rejects.toBeInstanceOf(
      SettlementMismatchError
    );
  });

  it("18–19. INR accepted; non-INR deferred", () => {
    expect(() =>
      buildImportBundleFromParts({
        header: {
          id: "setl_USD",
          amount: 100,
          created_at: Math.floor(Date.now() / 1000),
          utr: "x"
        },
        reconLines: [{ entity_id: "pay_1", type: "payment", currency: "USD", amount: 100 }],
        mappedLines: [
          {
            lineType: "PAYMENT",
            providerEntityId: "pay_1",
            amountInPaise: 100,
            feeInPaise: 0,
            taxInPaise: 0,
            debitInPaise: 0,
            creditInPaise: 100,
            providerPaymentId: "pay_1",
            providerRefundId: null,
            paymentId: null,
            orderId: null,
            mappingStatus: "UNMAPPED_PAYMENT",
            rawPayload: {},
            sortOrder: 0
          }
        ]
      })
    ).toThrow(/Non-INR/);
  });

  it("20–22. flags and dry-run defaults", () => {
    process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "0";
    expect(() => assertSettlementPostingPersistenceAllowed()).toThrow(
      AccountingSettlementPostingDisabledError
    );
    expect(resolveSettlementDiscoveryDryRun(false)).toBe(true);
    process.env.ACCOUNTING_SETTLEMENT_POSTING_ENABLED = "1";
    // Default remains dry-run when request omits dryRun
    expect(resolveSettlementDiscoveryDryRun(undefined)).toBe(true);
    expect(resolveSettlementDiscoveryDryRun(false)).toBe(false);
  });

  it("25. adapter forbids mutation method names on contract", () => {
    for (const m of RAZORPAY_SETTLEMENT_ADAPTER_FORBIDDEN_METHODS) {
      expect(m).toBeTruthy();
    }
    const client = mockClient({
      settlementId: "setl_X",
      amount: 1,
      lines: []
    });
    expect(Object.keys(client).sort()).toEqual([
      "fetchSettlement",
      "fetchSettlementRecon",
      "listSettlements"
    ]);
  });

  it("24. settlement import does not mutate Payment commerce fields", async () => {
    const order = await createSyntheticPaidOrder({ lines: [{ unitPriceInPaise: 10_000, qtyOrdered: 1 }] });
    createdOrders.push(order.id);
    const before = await prisma.payment.findUniqueOrThrow({
      where: { id: order.payments[0]!.id }
    });
    const payId = before.providerPaymentId!;
    const client = mockClient({
      settlementId: "setl_COMMERCE",
      amount: 9_710,
      lines: [
        {
          entity_id: payId,
          type: "payment",
          amount: 10_000,
          fee: 250,
          tax: 40,
          debit: 0,
          credit: 9_710
        }
      ]
    });
    await previewRazorpaySettlement("setl_COMMERCE", { client });
    await postRazorpaySettlement("setl_COMMERCE", { client });
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.gatewayFeeInPaise).toBe(before.gatewayFeeInPaise);
    expect(after.settledInPaise).toBe(before.settledInPaise);
    expect(after.settlementDate).toEqual(before.settlementDate);
    expect(after.status).toBe(before.status);
    expect(after.amountInPaise).toBe(before.amountInPaise);
  });
});
