import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

import { BankOpeningBalanceNotEligibleError } from "./accounting-errors";
import {
  BANK_OPENING_BALANCE_CALC_VERSION,
  BANK_OPENING_BALANCE_EVENT_TYPE,
  BANK_OPENING_BALANCE_SOURCE_TYPE,
  OPENING_BALANCE_EQUITY_CODE,
  bankOpeningBalanceUniqueKey
} from "./bank-account.constants";
import { assertBankAccountPostable } from "./bank-account.service";
import type { BankOpeningBalanceProposal } from "./bank-transfer.types";
import { getPostingEvent, postJournalFromEvent } from "./posting-event.service";
import { assertDocumentDateAllowedForPosting } from "./accounting-cutover";
import { assertBankingPersistenceAllowed } from "./production-guard";
import { getAccountingAccountByCode } from "./seed-coa";
import { assertEntryDateInOpenPeriod } from "./accounting-period.service";

export function buildBankOpeningBalanceProposal(input: {
  bankAccountId: string;
  glAccountCode: string;
  accountName: string;
  openingAmountInPaise: number;
  openingDate: Date;
  currency?: string;
}): BankOpeningBalanceProposal {
  const currency = (input.currency ?? "INR").toUpperCase();
  const amount = input.openingAmountInPaise;
  if (amount === 0) {
    throw new BankOpeningBalanceNotEligibleError("Opening amount cannot be zero", "ZERO_OPENING");
  }

  const lines =
    amount > 0
      ? [
          {
            accountCode: input.glAccountCode,
            debitInPaise: amount,
            creditInPaise: 0,
            lineMemo: `Opening balance ${input.accountName}`,
            amountSource: "opening.balance"
          },
          {
            accountCode: OPENING_BALANCE_EQUITY_CODE,
            debitInPaise: 0,
            creditInPaise: amount,
            lineMemo: "Opening balance equity offset",
            amountSource: "opening.equity"
          }
        ]
      : [
          {
            accountCode: OPENING_BALANCE_EQUITY_CODE,
            debitInPaise: Math.abs(amount),
            creditInPaise: 0,
            lineMemo: "Opening balance equity offset (overdraft)",
            amountSource: "opening.equity"
          },
          {
            accountCode: input.glAccountCode,
            debitInPaise: 0,
            creditInPaise: Math.abs(amount),
            lineMemo: `Opening balance ${input.accountName}`,
            amountSource: "opening.balance"
          }
        ];

  return {
    calcVersion: BANK_OPENING_BALANCE_CALC_VERSION,
    eventType: BANK_OPENING_BALANCE_EVENT_TYPE,
    uniqueKey: bankOpeningBalanceUniqueKey(input.bankAccountId),
    accountingDate: input.openingDate,
    currency,
    memo: `${BANK_OPENING_BALANCE_CALC_VERSION} ${input.accountName}`,
    balanced: true,
    lines,
    bankAccountId: input.bankAccountId,
    glAccountCode: input.glAccountCode,
    openingAmountInPaise: amount
  };
}

export async function postBankOpeningBalance(
  bankAccountId: string,
  input: {
    openingAmountInPaise: number;
    openingDate: Date;
    postedByUserId?: string;
    forcePersist?: boolean;
  }
) {
  if (!input.forcePersist) {
    assertBankingPersistenceAllowed();
  }

  const row = await assertBankAccountPostable(bankAccountId);
  const uniqueKey = bankOpeningBalanceUniqueKey(bankAccountId);
  const existing = await getPostingEvent(BANK_OPENING_BALANCE_EVENT_TYPE, uniqueKey);
  if (existing?.status === "POSTED" && existing.journalEntryId) {
    const journal = await prisma.accountingJournalEntry.findUniqueOrThrow({
      where: { id: existing.journalEntryId },
      include: { lines: { include: { account: true }, orderBy: { sortOrder: "asc" } } }
    });
    const proposal = buildBankOpeningBalanceProposal({
      bankAccountId,
      glAccountCode: row.glAccountCode,
      accountName: row.name,
      openingAmountInPaise: input.openingAmountInPaise,
      openingDate: input.openingDate,
      currency: row.currency
    });
    return { duplicate: true, event: existing, journal, proposal };
  }

  const proposal = buildBankOpeningBalanceProposal({
    bankAccountId,
    glAccountCode: row.glAccountCode,
    accountName: row.name,
    openingAmountInPaise: input.openingAmountInPaise,
    openingDate: input.openingDate,
    currency: row.currency
  });

  await assertEntryDateInOpenPeriod(proposal.accountingDate);
  assertDocumentDateAllowedForPosting(proposal.accountingDate);

  const codes = proposal.lines.map((l) => l.accountCode);
  const accountIds = new Map<string, string>();
  for (const code of [...new Set(codes)]) {
    const acct = await getAccountingAccountByCode(code);
    if (!acct) {
      throw new BankOpeningBalanceNotEligibleError(`Missing CoA ${code}`, "MISSING_ACCOUNT");
    }
    accountIds.set(code, acct.id);
  }

  const payloadJson = {
    calcVersion: proposal.calcVersion,
    bankAccountId,
    openingAmountInPaise: input.openingAmountInPaise
  } as Prisma.InputJsonValue;

  return postJournalFromEvent({
    eventType: BANK_OPENING_BALANCE_EVENT_TYPE,
    sourceType: BANK_OPENING_BALANCE_SOURCE_TYPE,
    sourceId: bankAccountId,
    uniqueKey: proposal.uniqueKey,
    payloadJson,
    entryDate: proposal.accountingDate,
    memo: proposal.memo,
    currency: proposal.currency,
    postedByUserId: input.postedByUserId,
    lines: proposal.lines.map((line, index) => ({
      accountId: accountIds.get(line.accountCode)!,
      debitInPaise: line.debitInPaise,
      creditInPaise: line.creditInPaise,
      lineMemo: line.lineMemo,
      sortOrder: index
    }))
  });
}

export async function previewBankOpeningBalance(
  bankAccountId: string,
  openingAmountInPaise: number,
  openingDate: Date
) {
  const row = await assertBankAccountPostable(bankAccountId);
  const proposal = buildBankOpeningBalanceProposal({
    bankAccountId,
    glAccountCode: row.glAccountCode,
    accountName: row.name,
    openingAmountInPaise,
    openingDate,
    currency: row.currency
  });
  const postingEvent = await getPostingEvent(
    BANK_OPENING_BALANCE_EVENT_TYPE,
    bankOpeningBalanceUniqueKey(bankAccountId)
  );
  return { proposal, postingEvent, bankAccount: row };
}
