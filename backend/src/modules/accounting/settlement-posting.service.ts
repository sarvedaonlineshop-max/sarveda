import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import {
  AccountingSettlementPostingDisabledError,
  SettlementNotEligibleForPostingError
} from "./accounting-errors";
import { getAccountingAccountByCode } from "./seed-coa";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";
import { postJournalFromEvent, getPostingEvent } from "./posting-event.service";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { assertSettlementPostingPersistenceAllowed } from "./production-guard";
import {
  PAYMENT_GATEWAY_SETTLED_DOCUMENT_TYPE,
  PAYMENT_GATEWAY_SETTLED_EVENT_TYPE,
  PAYMENT_GATEWAY_SETTLED_SOURCE_TYPE,
  razorpaySettlementUniqueKey
} from "./settlement.constants";
import {
  buildPaymentGatewaySettledJournal,
  summarizeMappedLines
} from "./settlement-journal.builder";
import {
  fetchAndBuildRazorpaySettlementBundle,
  loadSettlementBundleFromDb,
  persistSettlementImport
} from "./settlement-import.service";
import type { SettlementImportBundle, SettlementJournalProposal } from "./settlement.types";
import {
  createRazorpaySettlementReadClient,
  type RazorpaySettlementReadClient
} from "./razorpay-settlement.adapter";

async function resolveAccountIds(codes: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const code of [...new Set(codes)]) {
    const acct = await getAccountingAccountByCode(code);
    if (!acct) {
      throw new SettlementNotEligibleForPostingError(
        `Missing chart of accounts entry: ${code}`,
        "MISSING_ACCOUNT"
      );
    }
    map.set(code, acct.id);
  }
  return map;
}

function assertPostable(bundle: SettlementImportBundle, proposal: SettlementJournalProposal) {
  if (!bundle.utr?.trim()) {
    throw new SettlementNotEligibleForPostingError("Settlement UTR is required for posting", "MISSING_UTR");
  }
  if (!bundle.settledAt || Number.isNaN(bundle.settledAt.getTime())) {
    throw new SettlementNotEligibleForPostingError(
      "Settlement date missing",
      "MISSING_SETTLEMENT_DATE"
    );
  }
  if (bundle.currency !== "INR") {
    throw new SettlementNotEligibleForPostingError(
      `Currency ${bundle.currency} deferred`,
      "MULTI_CURRENCY_DEFERRED"
    );
  }
  if (!proposal.balanced) {
    throw new SettlementNotEligibleForPostingError(
      "Settlement journal not balanced / unexplained lines",
      "SETTLEMENT_NOT_BALANCED"
    );
  }
  if (proposal.diagnostics.unexplainedLines.length > 0) {
    throw new SettlementNotEligibleForPostingError(
      "Unexplained settlement lines block posting",
      "UNKNOWN_ADJUSTMENT"
    );
  }
}

export type SettlementPreviewResult = {
  bundle: SettlementImportBundle;
  proposal: SettlementJournalProposal | null;
  buildError?: { message: string; code: string };
  summary: ReturnType<typeof summarizeMappedLines>;
  postingEvent: Awaited<ReturnType<typeof getPostingEvent>>;
  dbSettlementId?: string;
  status?: string;
};

export async function previewRazorpaySettlement(
  providerSettlementId: string,
  opts?: {
    client?: RazorpaySettlementReadClient;
    persistEvidence?: boolean;
    targetBankAccountId?: string | null;
  }
): Promise<SettlementPreviewResult> {
  const client = opts?.client ?? createRazorpaySettlementReadClient();
  // Always fetch live/mock source when previewing so SETTLEMENT_MISMATCH can be detected.
  const fetched = await fetchAndBuildRazorpaySettlementBundle(providerSettlementId, client);
  let bundle = fetched;

  let dbSettlementId: string | undefined;
  let status: string | undefined;
  if (opts?.persistEvidence !== false) {
    const persisted = await persistSettlementImport(bundle);
    dbSettlementId = persisted.settlementId;
    status = persisted.status;
    bundle = persisted.bundle;
  }

  const uniqueKey = razorpaySettlementUniqueKey(providerSettlementId);
  const postingEvent = await getPostingEvent(PAYMENT_GATEWAY_SETTLED_EVENT_TYPE, uniqueKey);

  let targetBankAccountId = opts?.targetBankAccountId ?? null;
  if (dbSettlementId && targetBankAccountId) {
    await prisma.accountingGatewaySettlement.update({
      where: { id: dbSettlementId },
      data: { targetBankAccountId }
    });
  } else if (dbSettlementId && !targetBankAccountId) {
    const dbRow = await prisma.accountingGatewaySettlement.findUnique({
      where: { id: dbSettlementId },
      select: { targetBankAccountId: true }
    });
    targetBankAccountId = dbRow?.targetBankAccountId ?? null;
  }

  const { resolveRazorpayTargetBankGlCode } = await import("./bank-account.service");
  const targetBankGlCode = await resolveRazorpayTargetBankGlCode({ targetBankAccountId });

  try {
    const proposal = buildPaymentGatewaySettledJournal(bundle, {
      failOnImbalance: false,
      targetBankGlCode
    });
    if (dbSettlementId) {
      await prisma.accountingGatewaySettlement.update({
        where: { id: dbSettlementId },
        data: { status: proposal.balanced ? "PREVIEWED" : "FAILED", lastError: proposal.balanced ? null : "preview_unbalanced" }
      });
    }
    return {
      bundle,
      proposal,
      summary: summarizeMappedLines(bundle.mappedLines),
      postingEvent,
      dbSettlementId,
      status
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "SETTLEMENT_BUILD_FAILED";
    return {
      bundle,
      proposal: null,
      buildError: { message, code },
      summary: summarizeMappedLines(bundle.mappedLines),
      postingEvent,
      dbSettlementId,
      status
    };
  }
}

export type PostSettlementResult = {
  duplicate: boolean;
  proposal: SettlementJournalProposal;
  event: Awaited<ReturnType<typeof postJournalFromEvent>>["event"];
  journal: Awaited<ReturnType<typeof postJournalFromEvent>>["journal"];
  settlementId: string;
};

export async function postRazorpaySettlement(
  providerSettlementId: string,
  opts?: {
    postedByUserId?: string;
    forcePersist?: boolean;
    client?: RazorpaySettlementReadClient;
    targetBankAccountId?: string | null;
  }
): Promise<PostSettlementResult> {
  if (!opts?.forcePersist) {
    assertSettlementPostingPersistenceAllowed();
  }

  const preview = await previewRazorpaySettlement(providerSettlementId, {
    client: opts?.client,
    persistEvidence: true,
    targetBankAccountId: opts?.targetBankAccountId
  });
  if (!preview.proposal) {
    throw new SettlementNotEligibleForPostingError(
      preview.buildError?.message ?? "Unable to build settlement journal",
      preview.buildError?.code ?? "SETTLEMENT_BUILD_FAILED"
    );
  }
  assertPostable(preview.bundle, preview.proposal);
  assertDocumentDateAllowedForPosting(preview.proposal.accountingDate);
  await assertEntryDateInOpenPeriod(preview.proposal.accountingDate);

  const proposal = preview.proposal;
  const accountIds = await resolveAccountIds(proposal.lines.map((l) => l.accountCode));

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    providerSettlementId,
    utr: proposal.utr,
    diagnostics: proposal.diagnostics,
    grossInPaise: preview.bundle.grossInPaise,
    feeInPaise: preview.bundle.feeInPaise,
    taxInPaise: preview.bundle.taxInPaise,
    netInPaise: preview.bundle.netInPaise
  } as Prisma.InputJsonValue;

  const result = await postJournalFromEvent({
    eventType: PAYMENT_GATEWAY_SETTLED_EVENT_TYPE,
    sourceType: PAYMENT_GATEWAY_SETTLED_SOURCE_TYPE,
    sourceId: preview.dbSettlementId ?? providerSettlementId,
    uniqueKey: proposal.uniqueKey,
    payloadJson,
    entryDate: proposal.accountingDate,
    memo: proposal.memo,
    currency: proposal.currency,
    postedByUserId: opts?.postedByUserId,
    lines: proposal.lines.map((line, index) => ({
      accountId: accountIds.get(line.accountCode)!,
      debitInPaise: line.debitInPaise,
      creditInPaise: line.creditInPaise,
      lineMemo: line.lineMemo,
      sortOrder: index
    }))
  });

  const settlementRow = await prisma.accountingGatewaySettlement.findUniqueOrThrow({
    where: {
      provider_providerSettlementId: {
        provider: "RAZORPAY",
        providerSettlementId
      }
    }
  });

  await prisma.accountingGatewaySettlement.update({
    where: { id: settlementRow.id },
    data: {
      status: "POSTED",
      postingEventId: result.event.id,
      journalEntryId: result.journal.id,
      lastError: null
    }
  });

  if (!result.duplicate) {
    await prisma.accountingDocumentLink.upsert({
      where: {
        documentType_documentId_journalEntryId: {
          documentType: PAYMENT_GATEWAY_SETTLED_DOCUMENT_TYPE,
          documentId: settlementRow.id,
          journalEntryId: result.journal.id
        }
      },
      create: {
        documentType: PAYMENT_GATEWAY_SETTLED_DOCUMENT_TYPE,
        documentId: settlementRow.id,
        journalEntryId: result.journal.id,
        zohoDocumentId: proposal.utr,
        zohoDocumentType: proposal.utr ? "bank_utr" : null
      },
      update: {}
    });
  }

  return {
    duplicate: result.duplicate,
    proposal,
    event: result.event,
    journal: result.journal,
    settlementId: settlementRow.id
  };
}

/** Import-only without posting (evidence). */
export async function importRazorpaySettlementEvidence(
  providerSettlementId: string,
  client?: RazorpaySettlementReadClient
) {
  const bundle = await fetchAndBuildRazorpaySettlementBundle(
    providerSettlementId,
    client ?? createRazorpaySettlementReadClient()
  );
  return persistSettlementImport(bundle);
}
