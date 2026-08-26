import { createHash } from "crypto";

import { ACCOUNT_CODE } from "./order-paid.constants";
import {
  GST_ITC_STATUS_UNVERIFIED,
  PAYMENT_GATEWAY_SETTLED_CALC_VERSION,
  PAYMENT_GATEWAY_SETTLED_EVENT_TYPE,
  PAYMENT_GATEWAY_SETTLED_MAX_IMBALANCE_PAISE,
  razorpaySettlementUniqueKey
} from "./settlement.constants";
import type {
  MappedSettlementLine,
  SettlementImportBundle,
  SettlementJournalProposal
} from "./settlement.types";
import { SettlementJournalImbalanceError } from "./accounting-errors";

export function hashSettlementSource(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Build PAYMENT_GATEWAY_SETTLED_V1 journal from imported settlement evidence.
 * Fee + tax both expense to 5100 (ITC unverified). Clearing uses gross payment/refund legs.
 */
export function buildPaymentGatewaySettledJournal(
  bundle: SettlementImportBundle,
  opts?: { failOnImbalance?: boolean; targetBankGlCode?: string }
): SettlementJournalProposal {
  const failOnImbalance = opts?.failOnImbalance ?? true;
  const targetBankGlCode = opts?.targetBankGlCode ?? ACCOUNT_CODE.BANK;
  const lines = bundle.mappedLines;

  const paymentGross = sum(
    lines.filter((l) => l.lineType === "PAYMENT").map((l) => l.amountInPaise)
  );
  const refundGross = sum(
    lines.filter((l) => l.lineType === "REFUND").map((l) => l.amountInPaise)
  );
  const fee = bundle.feeInPaise;
  const tax = bundle.taxInPaise;
  const netBank = bundle.netInPaise;

  const unexplained = lines.filter(
    (l) =>
      l.lineType === "TRANSFER" ||
      l.lineType === "UNKNOWN" ||
      l.mappingStatus === "UNKNOWN_ADJUSTMENT" ||
      (l.lineType === "ADJUSTMENT" &&
        (l.amountInPaise !== 0 || l.debitInPaise !== 0 || l.creditInPaise !== 0))
  );

  const adjustmentNet = sum(
    lines
      .filter((l) => l.lineType === "ADJUSTMENT")
      .map((l) => l.creditInPaise - l.debitInPaise)
  );

  /**
   * Razorpay recon may report tax nested inside fee (G - F = N with tax > 0),
   * or tax-exclusive (G - F - T = N). Detect which identity holds.
   * GL V1 always expenses gateway cost to 5100; never claims Input GST automatically.
   * feeInPaise/taxInPaise remain stored separately on the settlement row for ITC later.
   */
  const netIfFeeInclusive = paymentGross - refundGross - fee + adjustmentNet;
  const netIfTaxExclusive = paymentGross - refundGross - fee - tax + adjustmentNet;
  const feeInclusiveMatch =
    Math.abs(netIfFeeInclusive - netBank) <= PAYMENT_GATEWAY_SETTLED_MAX_IMBALANCE_PAISE;
  const taxExclusiveMatch =
    Math.abs(netIfTaxExclusive - netBank) <= PAYMENT_GATEWAY_SETTLED_MAX_IMBALANCE_PAISE;

  let feeAndTaxExpensedPaise: number;
  let feeTaxMode: "FEE_INCLUSIVE_OF_TAX" | "TAX_EXCLUSIVE" | "UNKNOWN";
  if (taxExclusiveMatch && !feeInclusiveMatch) {
    feeAndTaxExpensedPaise = fee + tax;
    feeTaxMode = "TAX_EXCLUSIVE";
  } else if (feeInclusiveMatch) {
    feeAndTaxExpensedPaise = fee;
    feeTaxMode = tax > 0 ? "FEE_INCLUSIVE_OF_TAX" : "TAX_EXCLUSIVE";
  } else {
    feeAndTaxExpensedPaise = fee + tax;
    feeTaxMode = "UNKNOWN";
  }

  const expectedNet =
    feeTaxMode === "TAX_EXCLUSIVE" && !feeInclusiveMatch
      ? netIfTaxExclusive
      : feeInclusiveMatch
        ? netIfFeeInclusive
        : netIfTaxExclusive;
  const identityDiff = Math.abs(expectedNet - netBank);
  const arithmeticIdentityHolds =
    identityDiff <= PAYMENT_GATEWAY_SETTLED_MAX_IMBALANCE_PAISE && feeTaxMode !== "UNKNOWN";

  const journalLines: SettlementJournalProposal["lines"] = [];

  if (netBank > 0) {
    journalLines.push({
      accountCode: targetBankGlCode,
      debitInPaise: netBank,
      creditInPaise: 0,
      lineMemo: `Bank deposit UTR ${bundle.utr ?? "(none)"}`,
      amountSource: "settlement.net"
    });
  } else if (netBank < 0) {
    journalLines.push({
      accountCode: targetBankGlCode,
      debitInPaise: 0,
      creditInPaise: Math.abs(netBank),
      lineMemo: `Bank debit UTR ${bundle.utr ?? "(none)"}`,
      amountSource: "settlement.net"
    });
  }

  if (feeAndTaxExpensedPaise > 0) {
    journalLines.push({
      accountCode: ACCOUNT_CODE.GATEWAY_CHARGES,
      debitInPaise: feeAndTaxExpensedPaise,
      creditInPaise: 0,
      lineMemo: `Gateway charges fee=${fee} tax=${tax} mode=${feeTaxMode} (ITC unverified)`,
      amountSource: "settlement.gateway_charges"
    });
  }

  if (refundGross > 0) {
    journalLines.push({
      accountCode: ACCOUNT_CODE.RAZORPAY_CLEARING,
      debitInPaise: refundGross,
      creditInPaise: 0,
      lineMemo: "Refund clearing recovery",
      amountSource: "recon.refund.gross"
    });
  }

  if (paymentGross > 0) {
    journalLines.push({
      accountCode: ACCOUNT_CODE.RAZORPAY_CLEARING,
      debitInPaise: 0,
      creditInPaise: paymentGross,
      lineMemo: "Payment clearing release",
      amountSource: "recon.payment.gross"
    });
  }

  // Adjustments that affect net: if non-zero and unexplained, builder still includes
  // them only when they are zero-impact; otherwise leave for fail-closed on post.
  if (adjustmentNet !== 0 && unexplained.length === 0) {
    if (adjustmentNet > 0) {
      journalLines.push({
        accountCode: ACCOUNT_CODE.RAZORPAY_CLEARING,
        debitInPaise: 0,
        creditInPaise: adjustmentNet,
        lineMemo: "Settlement adjustment credit",
        amountSource: "recon.adjustment"
      });
    } else {
      journalLines.push({
        accountCode: ACCOUNT_CODE.RAZORPAY_CLEARING,
        debitInPaise: Math.abs(adjustmentNet),
        creditInPaise: 0,
        lineMemo: "Settlement adjustment debit",
        amountSource: "recon.adjustment"
      });
    }
  }

  const totalDebitPaise = sum(journalLines.map((l) => l.debitInPaise));
  const totalCreditPaise = sum(journalLines.map((l) => l.creditInPaise));
  const imbalancePaise = totalDebitPaise - totalCreditPaise;
  const balanced =
    Math.abs(imbalancePaise) <= PAYMENT_GATEWAY_SETTLED_MAX_IMBALANCE_PAISE &&
    arithmeticIdentityHolds &&
    unexplained.length === 0;

  if (failOnImbalance && !balanced) {
    throw new SettlementJournalImbalanceError(
      totalDebitPaise,
      totalCreditPaise,
      imbalancePaise,
      {
        arithmeticIdentityHolds,
        unexplainedCount: unexplained.length,
        identityDiff
      }
    );
  }

  const diagnostics = {
    paymentClearingReleasePaise: paymentGross,
    refundClearingRecoveryPaise: refundGross,
    adjustmentNetPaise: adjustmentNet,
    feeInPaise: fee,
    taxInPaise: tax,
    feeAndTaxExpensedPaise,
    feeTaxMode,
    netBankPaise: netBank,
    expectedDebitPaise: totalDebitPaise,
    expectedCreditPaise: totalCreditPaise,
    arithmeticIdentityHolds,
    unexplainedLines: unexplained.map((l) => ({
      providerEntityId: l.providerEntityId,
      lineType: l.lineType,
      mappingStatus: l.mappingStatus
    })),
    gstItcStatus: GST_ITC_STATUS_UNVERIFIED
  };

  return {
    calcVersion: PAYMENT_GATEWAY_SETTLED_CALC_VERSION,
    eventType: PAYMENT_GATEWAY_SETTLED_EVENT_TYPE,
    uniqueKey: razorpaySettlementUniqueKey(bundle.providerSettlementId),
    accountingDate: bundle.settledAt,
    currency: bundle.currency,
    memo: `${PAYMENT_GATEWAY_SETTLED_CALC_VERSION} ${bundle.providerSettlementId} UTR ${bundle.utr ?? "n/a"}`,
    balanced,
    imbalancePaise,
    totalDebitPaise,
    totalCreditPaise,
    lines: journalLines,
    diagnostics,
    providerSettlementId: bundle.providerSettlementId,
    utr: bundle.utr
  };
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}

export function summarizeMappedLines(lines: MappedSettlementLine[]) {
  return {
    paymentCount: lines.filter((l) => l.lineType === "PAYMENT").length,
    refundCount: lines.filter((l) => l.lineType === "REFUND").length,
    unmappedCount: lines.filter((l) => l.mappingStatus !== "MAPPED").length,
    unexplainedCount: lines.filter(
      (l) =>
        l.lineType === "TRANSFER" ||
        l.lineType === "UNKNOWN" ||
        l.mappingStatus === "UNKNOWN_ADJUSTMENT" ||
        l.lineType === "ADJUSTMENT"
    ).length
  };
}
