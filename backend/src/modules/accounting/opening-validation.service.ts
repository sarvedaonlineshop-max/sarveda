/**
 * Phase 7B — opening batch validation (no posting).
 */
import type { AccountingOpeningBatch } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  OPENING_EQUITY_CODES,
  OPENING_GST_CODES,
  RESERVED_CLEARING_CODES,
  TEST_IDENTIFIER_RE
} from "./opening.constants";

export type OpeningCheckStatus = "PASS" | "WARNING" | "FAIL" | "DATA_GAP";

export type OpeningValidationCheck = {
  code: string;
  status: OpeningCheckStatus;
  message: string;
  expectedInPaise?: number | null;
  actualInPaise?: number | null;
  varianceInPaise?: number | null;
};

export type OpeningValidationResult = {
  batchId: string;
  status: OpeningCheckStatus;
  checks: OpeningValidationCheck[];
  proposedDebitInPaise: number;
  proposedCreditInPaise: number;
  balanced: boolean;
};

function fail(code: string, message: string, extra?: Partial<OpeningValidationCheck>): OpeningValidationCheck {
  return { code, status: "FAIL", message, ...extra };
}
function pass(code: string, message: string, extra?: Partial<OpeningValidationCheck>): OpeningValidationCheck {
  return { code, status: "PASS", message, ...extra };
}
function warn(code: string, message: string, extra?: Partial<OpeningValidationCheck>): OpeningValidationCheck {
  return { code, status: "WARNING", message, ...extra };
}

export async function loadOpeningBatchGraph(batchId: string) {
  return prisma.accountingOpeningBatch.findUnique({
    where: { id: batchId },
    include: {
      skuMappings: { orderBy: { sortOrder: "asc" } },
      inventoryLines: { orderBy: { sortOrder: "asc" } },
      bankLines: { orderBy: { sortOrder: "asc" } },
      gatewayLines: { orderBy: { sortOrder: "asc" } },
      apLines: { orderBy: { sortOrder: "asc" } },
      arLines: { orderBy: { sortOrder: "asc" } },
      gstLines: { orderBy: { sortOrder: "asc" } },
      equityLines: { orderBy: { sortOrder: "asc" } }
    }
  });
}

export type OpeningBatchGraph = NonNullable<Awaited<ReturnType<typeof loadOpeningBatchGraph>>>;

/** Build proposed journal lines (debit/credit per account code) without posting. */
export function buildOpeningProposal(batch: OpeningBatchGraph): {
  lines: Array<{ accountCode: string; debitInPaise: number; creditInPaise: number; memo: string }>;
  totalDebitInPaise: number;
  totalCreditInPaise: number;
} {
  const lines: Array<{ accountCode: string; debitInPaise: number; creditInPaise: number; memo: string }> =
    [];

  const invTotal = batch.inventoryLines.reduce((s, l) => s + l.totalCostInPaise, 0);
  if (invTotal > 0) {
    lines.push({
      accountCode: "1200",
      debitInPaise: invTotal,
      creditInPaise: 0,
      memo: "Opening inventory"
    });
  }

  for (const b of batch.bankLines) {
    if (b.openingBookBalanceInPaise > 0) {
      lines.push({
        accountCode: b.glAccountCode,
        debitInPaise: b.openingBookBalanceInPaise,
        creditInPaise: 0,
        memo: `Opening bank ${b.name}`
      });
    } else if (b.openingBookBalanceInPaise < 0) {
      lines.push({
        accountCode: b.glAccountCode,
        debitInPaise: 0,
        creditInPaise: -b.openingBookBalanceInPaise,
        memo: `Opening bank overdraft ${b.name}`
      });
    }
  }

  for (const g of batch.gatewayLines) {
    const amt = Math.abs(g.unsettledAmountInPaise);
    if (!amt) continue;
    if (g.direction === "LIABILITY" || g.unsettledAmountInPaise < 0) {
      lines.push({
        accountCode: g.glAccountCode,
        debitInPaise: 0,
        creditInPaise: amt,
        memo: `Opening gateway ${g.provider}`
      });
    } else {
      lines.push({
        accountCode: g.glAccountCode,
        debitInPaise: amt,
        creditInPaise: 0,
        memo: `Opening gateway ${g.provider}`
      });
    }
  }

  const apTotal = batch.apLines.reduce((s, l) => s + l.outstandingInPaise, 0);
  if (apTotal > 0) {
    lines.push({
      accountCode: "2000",
      debitInPaise: 0,
      creditInPaise: apTotal,
      memo: "Opening AP"
    });
  }

  const arTotal = batch.arLines.reduce((s, l) => s + l.outstandingInPaise, 0);
  if (arTotal > 0) {
    lines.push({
      accountCode: "1100",
      debitInPaise: arTotal,
      creditInPaise: 0,
      memo: "Opening AR"
    });
  }

  for (const g of batch.gstLines) {
    if (g.balanceInPaise > 0) {
      lines.push({
        accountCode: g.accountCode,
        debitInPaise: g.balanceInPaise,
        creditInPaise: 0,
        memo: `Opening GST ${g.accountCode}`
      });
    } else if (g.balanceInPaise < 0) {
      lines.push({
        accountCode: g.accountCode,
        debitInPaise: 0,
        creditInPaise: -g.balanceInPaise,
        memo: `Opening GST ${g.accountCode}`
      });
    }
  }

  for (const e of batch.equityLines) {
    if (e.amountInPaise > 0) {
      lines.push({
        accountCode: e.accountCode,
        debitInPaise: 0,
        creditInPaise: e.amountInPaise,
        memo: `Opening equity ${e.accountCode}`
      });
    } else if (e.amountInPaise < 0) {
      lines.push({
        accountCode: e.accountCode,
        debitInPaise: -e.amountInPaise,
        creditInPaise: 0,
        memo: `Opening equity ${e.accountCode}`
      });
    }
  }

  const totalDebitInPaise = lines.reduce((s, l) => s + l.debitInPaise, 0);
  const totalCreditInPaise = lines.reduce((s, l) => s + l.creditInPaise, 0);
  return { lines, totalDebitInPaise, totalCreditInPaise };
}

export async function validateOpeningBatch(batchId: string): Promise<OpeningValidationResult> {
  const batch = await loadOpeningBatchGraph(batchId);
  if (!batch) {
    return {
      batchId,
      status: "FAIL",
      checks: [fail("BATCH_NOT_FOUND", "Opening batch not found")],
      proposedDebitInPaise: 0,
      proposedCreditInPaise: 0,
      balanced: false
    };
  }

  const checks: OpeningValidationCheck[] = [];
  const proposal = buildOpeningProposal(batch);

  // TEST identifiers
  const testHits: string[] = [];
  for (const l of batch.inventoryLines) {
    if (TEST_IDENTIFIER_RE.test(l.sku) || TEST_IDENTIFIER_RE.test(l.source ?? "")) {
      testHits.push(`inventory:${l.sku}`);
    }
  }
  for (const b of batch.bankLines) {
    if (TEST_IDENTIFIER_RE.test(b.name) || TEST_IDENTIFIER_RE.test(b.glAccountCode)) {
      testHits.push(`bank:${b.name}`);
    }
  }
  for (const a of batch.apLines) {
    if (TEST_IDENTIFIER_RE.test(a.vendorName) || TEST_IDENTIFIER_RE.test(a.billNumber)) {
      testHits.push(`ap:${a.billNumber}`);
    }
  }
  if (testHits.length && !batch.description?.includes("TEST-ACC-CUTOVER")) {
    checks.push(
      fail(
        "TEST_IDENTIFIERS",
        `Production opening data contains TEST identifiers: ${testHits.slice(0, 5).join(", ")}`
      )
    );
  } else if (testHits.length) {
    checks.push(
      warn("TEST_IDENTIFIERS_FIXTURE", "TEST-ACC-CUTOVER fixture identifiers present (allowed for 7B synthetic)")
    );
  } else {
    checks.push(pass("TEST_IDENTIFIERS", "No TEST identifiers in opening data"));
  }

  // SKU mappings
  for (const m of batch.skuMappings) {
    if (
      m.openingQty > 0 &&
      (m.matchStatus === "UNKNOWN" || m.matchStatus === "LEGACY_ONLY")
    ) {
      checks.push(
        fail(
          "SKU_MAPPING_BLOCKED",
          `SKU ${m.newSarvedaSku} matchStatus=${m.matchStatus} with openingQty ${m.openingQty}`
        )
      );
    }
    if (m.openingQty > 0 && m.reviewStatus !== "APPROVED") {
      checks.push(
        fail("SKU_MAPPING_UNAPPROVED", `SKU ${m.newSarvedaSku} reviewStatus=${m.reviewStatus}`)
      );
    }
  }

  // Inventory vs FIFO proposal
  const fifoValue = batch.inventoryLines.reduce((s, l) => s + l.totalCostInPaise, 0);
  const invGl = proposal.lines
    .filter((l) => l.accountCode === "1200")
    .reduce((s, l) => s + l.debitInPaise - l.creditInPaise, 0);
  checks.push(
    invGl === fifoValue
      ? pass("INVENTORY_GL_EQ_FIFO", "1200 proposal equals FIFO opening value", {
          expectedInPaise: fifoValue,
          actualInPaise: invGl,
          varianceInPaise: 0
        })
      : fail("INVENTORY_GL_EQ_FIFO", "1200 proposal ≠ FIFO value", {
          expectedInPaise: fifoValue,
          actualInPaise: invGl,
          varianceInPaise: invGl - fifoValue
        })
  );

  for (const l of batch.inventoryLines) {
    if (l.quantity < 0 || l.unitCostInPaise < 0) {
      checks.push(fail("INVENTORY_NEGATIVE", `SKU ${l.sku} has negative qty/cost`));
    }
    if (l.quantityMismatch) {
      checks.push(
        warn(
          "INVENTORY_QTY_MISMATCH",
          `SKU ${l.sku}: opening ${l.quantity} vs ops onHand ${l.operationalOnHand} — ops qty not overwritten`
        )
      );
    }
    if (!l.variantId) {
      checks.push(fail("INVENTORY_SKU_MISSING", `SKU ${l.sku} not resolved to ProductVariant`));
    }
  }

  // AP
  const apSum = batch.apLines.reduce((s, l) => s + l.outstandingInPaise, 0);
  const apGl = proposal.lines
    .filter((l) => l.accountCode === "2000")
    .reduce((s, l) => s + l.creditInPaise - l.debitInPaise, 0);
  checks.push(
    apGl === apSum
      ? pass("AP_GL_EQ_SUBLEDGER", "2000 equals AP staged outstanding", {
          expectedInPaise: apSum,
          actualInPaise: apGl
        })
      : fail("AP_GL_EQ_SUBLEDGER", "2000 ≠ AP staged", {
          expectedInPaise: apSum,
          actualInPaise: apGl,
          varianceInPaise: apGl - apSum
        })
  );

  // AR
  const arSum = batch.arLines.reduce((s, l) => s + l.outstandingInPaise, 0);
  const arGl = proposal.lines
    .filter((l) => l.accountCode === "1100")
    .reduce((s, l) => s + l.debitInPaise - l.creditInPaise, 0);
  if (arSum === 0 && batch.arApprovedZero) {
    checks.push(pass("AR_APPROVED_ZERO", "AR approved zero — 1100 opening 0"));
  } else if (arSum === 0 && !batch.arApprovedZero) {
    checks.push(
      fail("AR_ZERO_UNAPPROVED", "AR staged empty but arApprovedZero not set — confirm explicitly")
    );
  } else {
    checks.push(
      arGl === arSum
        ? pass("AR_GL_EQ_SUBLEDGER", "1100 equals AR staged", {
            expectedInPaise: arSum,
            actualInPaise: arGl
          })
        : fail("AR_GL_EQ_SUBLEDGER", "1100 ≠ AR staged", {
            expectedInPaise: arSum,
            actualInPaise: arGl,
            varianceInPaise: arGl - arSum
          })
    );
  }

  // Banks
  for (const b of batch.bankLines) {
    if (RESERVED_CLEARING_CODES.has(b.glAccountCode)) {
      checks.push(fail("BANK_RESERVED_GL", `Bank ${b.name} uses reserved clearing GL ${b.glAccountCode}`));
    }
    if (TEST_IDENTIFIER_RE.test(b.name) && !batch.description?.includes("TEST-ACC-CUTOVER")) {
      checks.push(fail("BANK_TEST_NAME", `Bank name looks like TEST: ${b.name}`));
    }
  }

  // Gateway
  for (const g of batch.gatewayLines) {
    const expectedCode =
      g.provider === "RAZORPAY"
        ? "1020"
        : g.provider === "STRIPE"
          ? "1021"
          : g.provider === "PAYPAL"
            ? "1022"
            : g.glAccountCode;
    if (g.provider !== "COD" && g.glAccountCode !== expectedCode) {
      checks.push(
        warn(
          "GATEWAY_CODE_MISMATCH",
          `${g.provider} mapped to ${g.glAccountCode}, expected ${expectedCode}`
        )
      );
    }
  }

  // GST codes
  for (const g of batch.gstLines) {
    if (!(OPENING_GST_CODES as readonly string[]).includes(g.accountCode)) {
      checks.push(fail("GST_INVALID_CODE", `Invalid GST account ${g.accountCode}`));
    }
  }

  // Equity 3900
  const e3900 = batch.equityLines.find((e) => e.accountCode === "3900");
  if (e3900 && e3900.amountInPaise !== 0) {
    if (!batch.equity3900Approved || !batch.equity3900Reason || !batch.equity3900Reviewer) {
      checks.push(
        fail(
          "EQUITY_3900_UNAPPROVED",
          "3900 Opening Balance Equity requires reason, reviewer, and explicit approval"
        )
      );
    } else {
      checks.push(
        warn("EQUITY_3900_APPROVED_PLUG", `3900 plug ${e3900.amountInPaise} paise approved — clear before 7D`)
      );
    }
  }

  for (const e of batch.equityLines) {
    if (!(OPENING_EQUITY_CODES as readonly string[]).includes(e.accountCode)) {
      checks.push(fail("EQUITY_INVALID_CODE", `Invalid equity account ${e.accountCode}`));
    }
  }

  // Balance
  const balanced = proposal.totalDebitInPaise === proposal.totalCreditInPaise;
  checks.push(
    balanced
      ? pass("OPENING_DR_EQ_CR", "Opening proposal debits equal credits", {
          expectedInPaise: proposal.totalCreditInPaise,
          actualInPaise: proposal.totalDebitInPaise,
          varianceInPaise: 0
        })
      : fail("OPENING_DR_EQ_CR", "Opening proposal out of balance", {
          expectedInPaise: proposal.totalCreditInPaise,
          actualInPaise: proposal.totalDebitInPaise,
          varianceInPaise: proposal.totalDebitInPaise - proposal.totalCreditInPaise
        })
  );

  const hasFail = checks.some((c) => c.status === "FAIL");
  const hasWarn = checks.some((c) => c.status === "WARNING");
  const status: OpeningCheckStatus = hasFail ? "FAIL" : hasWarn ? "WARNING" : "PASS";

  return {
    batchId,
    status,
    checks,
    proposedDebitInPaise: proposal.totalDebitInPaise,
    proposedCreditInPaise: proposal.totalCreditInPaise,
    balanced
  };
}

export function isBatchMutable(batch: Pick<AccountingOpeningBatch, "status">): boolean {
  return batch.status === "DRAFT" || batch.status === "VALIDATED";
}
