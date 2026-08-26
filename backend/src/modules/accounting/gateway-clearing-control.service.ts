import { prisma } from "../../config/db";

import { GATEWAY_CLEARING_CODES } from "./bank-reconciliation.constants";
import { getAccountingAccountByCode } from "./seed-coa";
import type { GatewayControlRow, GatewayControlStatus } from "./bank-reconciliation.types";

async function glActivity(code: string) {
  const acct = await getAccountingAccountByCode(code);
  if (!acct) {
    return {
      glName: code,
      balanceInPaise: 0,
      debitTotalInPaise: 0,
      creditTotalInPaise: 0,
      postedSourceCount: 0
    };
  }
  const agg = await prisma.accountingJournalLine.aggregate({
    where: { accountId: acct.id, journalEntry: { status: "POSTED" } },
    _sum: { debitInPaise: true, creditInPaise: true },
    _count: { _all: true }
  });
  const debitTotalInPaise = agg._sum.debitInPaise ?? 0;
  const creditTotalInPaise = agg._sum.creditInPaise ?? 0;
  return {
    glName: acct.name,
    balanceInPaise: debitTotalInPaise - creditTotalInPaise,
    debitTotalInPaise,
    creditTotalInPaise,
    postedSourceCount: agg._count._all
  };
}

export async function getGatewayClearingControls(): Promise<GatewayControlRow[]> {
  const razorpayGl = await glActivity(GATEWAY_CLEARING_CODES.RAZORPAY);
  const lastSettlement = await prisma.accountingGatewaySettlement.findFirst({
    where: { status: "POSTED", provider: "RAZORPAY" },
    orderBy: { settledAt: "desc" },
    select: { settledAt: true, utr: true, netInPaise: true }
  });
  const settlementCount = await prisma.accountingGatewaySettlement.count({
    where: { status: "POSTED", provider: "RAZORPAY" }
  });

  const razorpayWarnings: string[] = [];
  let razorpayStatus: GatewayControlStatus = "CLEAR";
  if (razorpayGl.balanceInPaise !== 0) {
    razorpayStatus = "OUTSTANDING";
    razorpayWarnings.push("1020 Razorpay Clearing has a non-zero POSTED GL balance");
  }
  if (settlementCount === 0 && razorpayGl.debitTotalInPaise > 0) {
    razorpayStatus = "REVIEW_REQUIRED";
    razorpayWarnings.push("Clearing debits exist but no posted Razorpay settlements found");
  }

  const stripeGl = await glActivity(GATEWAY_CLEARING_CODES.STRIPE);
  const stripeSettlementCount = await prisma.accountingGatewaySettlement.count({
    where: { status: "POSTED", provider: "STRIPE" }
  });
  const stripePaymentCount = await prisma.payment.count({
    where: { provider: "STRIPE", status: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] } }
  });
  const stripeWarnings: string[] = [
    "Stripe settlement accounting is not configured in native accounting V1"
  ];
  let stripeStatus: GatewayControlStatus = "SETTLEMENT_NOT_CONFIGURED";
  if (stripePaymentCount > 0 || stripeGl.balanceInPaise !== 0) {
    stripeStatus = "DATA_GAP";
    stripeWarnings.push("Captured Stripe payments and/or 1021 GL activity exist without settlement posting");
  }
  if (stripeSettlementCount > 0) {
    stripeStatus = stripeGl.balanceInPaise === 0 ? "CLEAR" : "OUTSTANDING";
  }

  const paypalGl = await glActivity(GATEWAY_CLEARING_CODES.PAYPAL);
  const paypalSettlementCount = await prisma.accountingGatewaySettlement.count({
    where: { status: "POSTED", provider: "PAYPAL" }
  });
  const paypalPaymentCount = await prisma.payment.count({
    where: { provider: "PAYPAL", status: { in: ["CAPTURED", "REFUNDED", "PARTIALLY_REFUNDED"] } }
  });
  const paypalWarnings: string[] = [
    "PayPal settlement accounting is not configured in native accounting V1"
  ];
  let paypalStatus: GatewayControlStatus = "SETTLEMENT_NOT_CONFIGURED";
  if (paypalPaymentCount > 0 || paypalGl.balanceInPaise !== 0) {
    paypalStatus = "DATA_GAP";
    paypalWarnings.push("Captured PayPal payments and/or 1022 GL activity exist without settlement posting");
  }
  if (paypalSettlementCount > 0) {
    paypalStatus = paypalGl.balanceInPaise === 0 ? "CLEAR" : "OUTSTANDING";
  }

  const codGl = await glActivity(GATEWAY_CLEARING_CODES.COD_AR);
  const deliveredCodOrders = await prisma.order.count({
    where: {
      fulfillmentStatus: "FULFILLED",
      payments: { some: { provider: "COD" } }
    }
  });
  const codWarnings: string[] = [
    "COD remittance posting is not implemented (COD_REMITTANCE_V1 stub only)",
    "DELIVERED/FULFILLED fulfillment is NOT financial collection evidence"
  ];
  if (deliveredCodOrders > 0) {
    codWarnings.push(
      `${deliveredCodOrders} fulfilled COD order(s) exist — do not treat as remitted cash`
    );
  }

  return [
    {
      provider: "RAZORPAY",
      glCode: GATEWAY_CLEARING_CODES.RAZORPAY,
      glName: razorpayGl.glName,
      balanceInPaise: razorpayGl.balanceInPaise,
      debitTotalInPaise: razorpayGl.debitTotalInPaise,
      creditTotalInPaise: razorpayGl.creditTotalInPaise,
      postedSourceCount: razorpayGl.postedSourceCount,
      lastSettlementAt: lastSettlement?.settledAt?.toISOString() ?? null,
      lastSettlementUtr: lastSettlement?.utr ?? null,
      status: razorpayStatus,
      warnings: razorpayWarnings
    },
    {
      provider: "STRIPE",
      glCode: GATEWAY_CLEARING_CODES.STRIPE,
      glName: stripeGl.glName,
      balanceInPaise: stripeGl.balanceInPaise,
      debitTotalInPaise: stripeGl.debitTotalInPaise,
      creditTotalInPaise: stripeGl.creditTotalInPaise,
      postedSourceCount: stripeGl.postedSourceCount,
      lastSettlementAt: null,
      lastSettlementUtr: null,
      status: stripeStatus,
      warnings: stripeWarnings
    },
    {
      provider: "PAYPAL",
      glCode: GATEWAY_CLEARING_CODES.PAYPAL,
      glName: paypalGl.glName,
      balanceInPaise: paypalGl.balanceInPaise,
      debitTotalInPaise: paypalGl.debitTotalInPaise,
      creditTotalInPaise: paypalGl.creditTotalInPaise,
      postedSourceCount: paypalGl.postedSourceCount,
      lastSettlementAt: null,
      lastSettlementUtr: null,
      status: paypalStatus,
      warnings: paypalWarnings
    },
    {
      provider: "COD",
      glCode: GATEWAY_CLEARING_CODES.COD_AR,
      glName: codGl.glName,
      balanceInPaise: codGl.balanceInPaise,
      debitTotalInPaise: codGl.debitTotalInPaise,
      creditTotalInPaise: codGl.creditTotalInPaise,
      postedSourceCount: codGl.postedSourceCount,
      lastSettlementAt: null,
      lastSettlementUtr: null,
      status: "DATA_GAP",
      warnings: codWarnings
    }
  ];
}

/**
 * Future COD remittance design stub — NOT implemented for posting.
 * Feature remains gated OFF; no remittance journals are created here.
 */
export type CodRemittanceV1DesignStub = {
  eventType: "COD_REMITTANCE_V1";
  requiredEvidence: string[];
  status: "NOT_IMPLEMENTED";
};

export function getCodRemittanceDesignStub(): CodRemittanceV1DesignStub {
  return {
    eventType: "COD_REMITTANCE_V1",
    requiredEvidence: [
      "Courier remittance advice / UTR",
      "Amount collected vs remitted",
      "Target bank account",
      "Explicit ACCOUNTING_COD_COLLECTION_ENABLED=1"
    ],
    status: "NOT_IMPLEMENTED"
  };
}
