import type {
  AccountingGatewaySettlementLineMappingStatus,
  AccountingGatewaySettlementLineType,
  Prisma
} from "@prisma/client";

import { prisma } from "../../config/db";

import {
  NonInrSettlementDeferredError,
  SettlementMismatchError,
  SettlementNotEligibleForPostingError
} from "./accounting-errors";
import {
  createRazorpaySettlementReadClient,
  type RazorpaySettlementReadClient
} from "./razorpay-settlement.adapter";
import { GST_ITC_STATUS_UNVERIFIED } from "./settlement.constants";
import { hashSettlementSource } from "./settlement-journal.builder";
import type {
  MappedSettlementLine,
  RazorpaySettlementHeader,
  RazorpaySettlementReconLine,
  SettlementImportBundle,
  SettlementLineType
} from "./settlement.types";

function mapLineType(type: string): SettlementLineType {
  const t = type.trim().toLowerCase();
  if (t === "payment") return "PAYMENT";
  if (t === "refund") return "REFUND";
  if (t === "transfer") return "TRANSFER";
  if (t === "adjustment") return "ADJUSTMENT";
  return "UNKNOWN";
}

function toPrismaLineType(t: SettlementLineType): AccountingGatewaySettlementLineType {
  return t;
}

function toPrismaMapping(
  s: MappedSettlementLine["mappingStatus"]
): AccountingGatewaySettlementLineMappingStatus {
  return s;
}

async function mapReconLine(line: RazorpaySettlementReconLine): Promise<MappedSettlementLine> {
  const lineType = mapLineType(String(line.type ?? "unknown"));
  const providerEntityId = String(line.entity_id ?? "");
  const amountInPaise = Number(line.amount ?? 0);
  const feeInPaise = Number(line.fee ?? 0);
  const taxInPaise = Number(line.tax ?? 0);
  const debitInPaise = Number(line.debit ?? 0);
  const creditInPaise = Number(line.credit ?? 0);

  let providerPaymentId: string | null = null;
  let providerRefundId: string | null = null;
  let paymentId: string | null = null;
  let orderId: string | null = null;
  let mappingStatus: MappedSettlementLine["mappingStatus"] = "UNMAPPED";

  if (!providerEntityId) {
    mappingStatus = "DATA_GAP";
  } else if (lineType === "PAYMENT") {
    providerPaymentId = providerEntityId;
    const pay = await prisma.payment.findFirst({
      where: { provider: "RAZORPAY", providerPaymentId },
      select: { id: true, orderId: true }
    });
    if (pay) {
      paymentId = pay.id;
      orderId = pay.orderId;
      mappingStatus = "MAPPED";
    } else {
      mappingStatus = "UNMAPPED_PAYMENT";
    }
  } else if (lineType === "REFUND") {
    providerRefundId = providerEntityId;
    providerPaymentId =
      typeof line.payment_id === "string" && line.payment_id ? line.payment_id : null;
    const refund = await prisma.refund.findFirst({
      where: { providerRefundId },
      include: { payment: { select: { id: true, orderId: true, providerPaymentId: true } } }
    });
    if (refund) {
      paymentId = refund.payment.id;
      orderId = refund.payment.orderId;
      providerPaymentId = refund.payment.providerPaymentId ?? providerPaymentId;
      mappingStatus = "MAPPED";
    } else {
      mappingStatus = "UNMAPPED_REFUND";
    }
  } else if (lineType === "ADJUSTMENT") {
    mappingStatus = "UNKNOWN_ADJUSTMENT";
  } else if (lineType === "TRANSFER") {
    mappingStatus = "DATA_GAP";
  } else {
    mappingStatus = "DATA_GAP";
  }

  return {
    lineType,
    providerEntityId: providerEntityId || `unknown-${Math.random().toString(36).slice(2)}`,
    amountInPaise,
    feeInPaise,
    taxInPaise,
    debitInPaise,
    creditInPaise,
    providerPaymentId,
    providerRefundId,
    paymentId,
    orderId,
    mappingStatus,
    rawPayload: line as Record<string, unknown>,
    sortOrder: 0
  };
}

export function buildImportBundleFromParts(input: {
  header: RazorpaySettlementHeader;
  reconLines: RazorpaySettlementReconLine[];
  mappedLines: MappedSettlementLine[];
}): SettlementImportBundle {
  const currency = (
    input.reconLines.find((l) => l.currency)?.currency ?? "INR"
  )
    .toString()
    .toUpperCase();

  if (currency !== "INR") {
    throw new NonInrSettlementDeferredError(currency);
  }

  const settledAtMs = (input.header.created_at ?? 0) * 1000;
  if (!settledAtMs) {
    throw new SettlementNotEligibleForPostingError(
      "Settlement date (created_at) missing",
      "MISSING_SETTLEMENT_DATE"
    );
  }
  const settledAt = new Date(settledAtMs);
  const utr = input.header.utr?.trim() || input.reconLines.find((l) => l.settlement_utr)?.settlement_utr || null;

  const paymentLines = input.mappedLines.filter((l) => l.lineType === "PAYMENT");
  const grossInPaise = paymentLines.reduce((s, l) => s + l.amountInPaise, 0);
  const feeInPaise = input.mappedLines.reduce((s, l) => s + l.feeInPaise, 0);
  const taxInPaise = input.mappedLines.reduce((s, l) => s + l.taxInPaise, 0);
  const netInPaise = Number(input.header.amount ?? 0);

  const sourcePayload = {
    header: input.header,
    reconLines: input.reconLines
  };

  return {
    provider: "RAZORPAY",
    providerSettlementId: input.header.id,
    currency,
    settledAt,
    utr: utr ? String(utr) : null,
    grossInPaise,
    feeInPaise,
    taxInPaise,
    netInPaise,
    sourcePayloadHash: hashSettlementSource(sourcePayload),
    header: input.header,
    reconLines: input.reconLines,
    mappedLines: input.mappedLines.map((l, i) => ({ ...l, sortOrder: i }))
  };
}

export async function fetchAndBuildRazorpaySettlementBundle(
  settlementId: string,
  client: RazorpaySettlementReadClient = createRazorpaySettlementReadClient()
): Promise<SettlementImportBundle> {
  const header = await client.fetchSettlement(settlementId);
  const settledAt = new Date(header.created_at * 1000);
  const year = settledAt.getUTCFullYear();
  const month = settledAt.getUTCMonth() + 1;
  const day = settledAt.getUTCDate();

  let reconLines = await client.fetchSettlementRecon({ year, month, day, count: 1000 });
  reconLines = reconLines.filter((l) => String(l.settlement_id ?? "") === settlementId);

  // Fallback: month-wide if day filter returned none (timezone edge)
  if (reconLines.length === 0) {
    const monthLines = await client.fetchSettlementRecon({ year, month, count: 1000 });
    reconLines = monthLines.filter((l) => String(l.settlement_id ?? "") === settlementId);
  }

  const mappedLines: MappedSettlementLine[] = [];
  for (const line of reconLines) {
    mappedLines.push(await mapReconLine(line));
  }

  return buildImportBundleFromParts({ header, reconLines, mappedLines });
}

export type PersistSettlementImportResult = {
  settlementId: string;
  providerSettlementId: string;
  created: boolean;
  mismatch: boolean;
  status: string;
  bundle: SettlementImportBundle;
};

/**
 * Persist settlement evidence (Accounting* only). Idempotent on provider+settlementId.
 */
export async function persistSettlementImport(
  bundle: SettlementImportBundle
): Promise<PersistSettlementImportResult> {
  if (bundle.currency !== "INR") {
    throw new NonInrSettlementDeferredError(bundle.currency);
  }

  const existing = await prisma.accountingGatewaySettlement.findUnique({
    where: {
      provider_providerSettlementId: {
        provider: "RAZORPAY",
        providerSettlementId: bundle.providerSettlementId
      }
    },
    include: { lines: true }
  });

  if (existing) {
    if (existing.sourcePayloadHash !== bundle.sourcePayloadHash) {
      await prisma.accountingGatewaySettlement.update({
        where: { id: existing.id },
        data: {
          status: "MISMATCH",
          lastError: "SETTLEMENT_MISMATCH: source payload hash differs"
        }
      });
      throw new SettlementMismatchError(bundle.providerSettlementId);
    }
    return {
      settlementId: existing.id,
      providerSettlementId: existing.providerSettlementId,
      created: false,
      mismatch: false,
      status: existing.status,
      bundle
    };
  }

  const created = await prisma.accountingGatewaySettlement.create({
    data: {
      provider: "RAZORPAY",
      providerSettlementId: bundle.providerSettlementId,
      currency: bundle.currency,
      settledAt: bundle.settledAt,
      utr: bundle.utr,
      grossInPaise: bundle.grossInPaise,
      feeInPaise: bundle.feeInPaise,
      taxInPaise: bundle.taxInPaise,
      netInPaise: bundle.netInPaise,
      status: "IMPORTED",
      gstItcStatus: GST_ITC_STATUS_UNVERIFIED,
      sourcePayloadHash: bundle.sourcePayloadHash,
      rawPayload: {
        header: bundle.header,
        reconLines: bundle.reconLines
      } as Prisma.InputJsonValue,
      lines: {
        create: bundle.mappedLines.map((l) => ({
          lineType: toPrismaLineType(l.lineType),
          providerEntityId: l.providerEntityId,
          amountInPaise: l.amountInPaise,
          feeInPaise: l.feeInPaise,
          taxInPaise: l.taxInPaise,
          debitInPaise: l.debitInPaise,
          creditInPaise: l.creditInPaise,
          providerPaymentId: l.providerPaymentId,
          providerRefundId: l.providerRefundId,
          paymentId: l.paymentId,
          orderId: l.orderId,
          mappingStatus: toPrismaMapping(l.mappingStatus),
          rawPayload: l.rawPayload as Prisma.InputJsonValue,
          sortOrder: l.sortOrder
        }))
      }
    }
  });

  return {
    settlementId: created.id,
    providerSettlementId: created.providerSettlementId,
    created: true,
    mismatch: false,
    status: created.status,
    bundle
  };
}

export async function loadSettlementBundleFromDb(
  providerSettlementId: string
): Promise<SettlementImportBundle | null> {
  const row = await prisma.accountingGatewaySettlement.findUnique({
    where: {
      provider_providerSettlementId: {
        provider: "RAZORPAY",
        providerSettlementId
      }
    },
    include: { lines: { orderBy: { sortOrder: "asc" } } }
  });
  if (!row) return null;

  const raw = (row.rawPayload ?? {}) as {
    header?: RazorpaySettlementHeader;
    reconLines?: RazorpaySettlementReconLine[];
  };

  return {
    provider: "RAZORPAY",
    providerSettlementId: row.providerSettlementId,
    currency: row.currency,
    settledAt: row.settledAt,
    utr: row.utr,
    grossInPaise: row.grossInPaise,
    feeInPaise: row.feeInPaise,
    taxInPaise: row.taxInPaise,
    netInPaise: row.netInPaise,
    sourcePayloadHash: row.sourcePayloadHash,
    header: raw.header ?? {
      id: row.providerSettlementId,
      amount: row.netInPaise,
      created_at: Math.floor(row.settledAt.getTime() / 1000),
      utr: row.utr
    },
    reconLines: raw.reconLines ?? [],
    mappedLines: row.lines.map((l) => ({
      lineType: l.lineType as SettlementLineType,
      providerEntityId: l.providerEntityId,
      amountInPaise: l.amountInPaise,
      feeInPaise: l.feeInPaise,
      taxInPaise: l.taxInPaise,
      debitInPaise: l.debitInPaise,
      creditInPaise: l.creditInPaise,
      providerPaymentId: l.providerPaymentId,
      providerRefundId: l.providerRefundId,
      paymentId: l.paymentId,
      orderId: l.orderId,
      mappingStatus: l.mappingStatus as MappedSettlementLine["mappingStatus"],
      rawPayload: (l.rawPayload ?? {}) as Record<string, unknown>,
      sortOrder: l.sortOrder
    }))
  };
}
