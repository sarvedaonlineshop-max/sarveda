import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupAccountingTestData,
  getAccountIdByCode,
  prisma,
  seedMinimalCoAForTests
} from "../helpers/commerce";
import {
  InvalidJournalLineError,
  PostedJournalImmutableError,
  UnbalancedJournalError,
  ZeroValueJournalError
} from "../../src/modules/accounting/accounting-errors";
import {
  createAndPostJournal,
  deleteJournalLine,
  updateJournalEntry
} from "../../src/modules/accounting/journal.service";
import { postJournalFromEvent } from "../../src/modules/accounting/posting-event.service";
import { isNativeAccountingEnabled } from "../../src/modules/accounting/accounting-flag";
import { seedAccountingChartOfAccounts } from "../../src/modules/accounting/seed-coa";

describe("accounting feature flags", () => {
  it("defaults NATIVE_ACCOUNTING_ENABLED to off in test setup", () => {
    expect(isNativeAccountingEnabled()).toBe(false);
  });
});

describe("accounting journal engine (synthetic)", () => {
  beforeAll(async () => {
    await seedAccountingChartOfAccounts();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
  });

  it("posts balanced sale journal (AR Dr, Sales + GST Cr)", async () => {
    const ar = await getAccountIdByCode("1100");
    const sales = await getAccountIdByCode("4000");
    const cgst = await getAccountIdByCode("2100");
    const sgst = await getAccountIdByCode("2101");

    const entry = await createAndPostJournal({
      entryDate: new Date("2026-08-22"),
      memo: "Synthetic test sale",
      lines: [
        { accountId: ar, debitInPaise: 118_000, lineMemo: "Customer invoice" },
        { accountId: sales, creditInPaise: 100_000 },
        { accountId: cgst, creditInPaise: 9_000 },
        { accountId: sgst, creditInPaise: 9_000 }
      ]
    });

    expect(entry.status).toBe("POSTED");
    expect(entry.totalDebitInPaise).toBe(118_000);
    expect(entry.totalCreditInPaise).toBe(118_000);
    expect(entry.lines).toHaveLength(4);
  });

  it("posts balanced payment journal (Razorpay Clearing Dr, AR Cr)", async () => {
    const clearing = await getAccountIdByCode("1020");
    const ar = await getAccountIdByCode("1100");

    const entry = await createAndPostJournal({
      entryDate: new Date("2026-08-22"),
      memo: "Synthetic test payment",
      lines: [
        { accountId: clearing, debitInPaise: 118_000 },
        { accountId: ar, creditInPaise: 118_000 }
      ]
    });

    expect(entry.status).toBe("POSTED");
    expect(entry.totalDebitInPaise).toBe(118_000);
  });

  it("rejects unbalanced entry", async () => {
    const ar = await getAccountIdByCode("1100");
    const sales = await getAccountIdByCode("4000");

    await expect(
      createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        lines: [
          { accountId: ar, debitInPaise: 100_000 },
          { accountId: sales, creditInPaise: 90_000 }
        ]
      })
    ).rejects.toBeInstanceOf(UnbalancedJournalError);
  });

  it("rejects debit+credit on same line", async () => {
    const ar = await getAccountIdByCode("1100");

    await expect(
      createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        lines: [{ accountId: ar, debitInPaise: 100, creditInPaise: 100 }]
      })
    ).rejects.toBeInstanceOf(InvalidJournalLineError);
  });

  it("rejects zero-value journal", async () => {
    const ar = await getAccountIdByCode("1100");

    await expect(
      createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        lines: [{ accountId: ar, debitInPaise: 0, creditInPaise: 0 }]
      })
    ).rejects.toBeInstanceOf(InvalidJournalLineError);
  });

  it("rejects journal with zero total debits via balance validator", async () => {
    const sales = await getAccountIdByCode("4000");

    await expect(
      createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        lines: [{ accountId: sales, creditInPaise: 100 }]
      })
    ).rejects.toBeInstanceOf(ZeroValueJournalError);
  });

  it("rejects duplicate posting for same unique event", async () => {
    const ar = await getAccountIdByCode("1100");
    const sales = await getAccountIdByCode("4000");
    const uniqueKey = `synthetic:sale:${Date.now()}`;

    const first = await postJournalFromEvent({
      eventType: "SYNTHETIC_SALE",
      sourceType: "TEST",
      sourceId: "test-1",
      uniqueKey,
      entryDate: new Date("2026-08-22"),
      memo: "Idempotent sale",
      lines: [
        { accountId: ar, debitInPaise: 1_000 },
        { accountId: sales, creditInPaise: 1_000 }
      ]
    });
    expect(first.duplicate).toBe(false);

    const second = await postJournalFromEvent({
      eventType: "SYNTHETIC_SALE",
      sourceType: "TEST",
      sourceId: "test-1",
      uniqueKey,
      entryDate: new Date("2026-08-22"),
      memo: "Idempotent sale retry",
      lines: [
        { accountId: ar, debitInPaise: 1_000 },
        { accountId: sales, creditInPaise: 1_000 }
      ]
    });
    expect(second.duplicate).toBe(true);
    expect(second.journal.id).toBe(first.journal.id);

    const journalCount = await prisma.accountingJournalEntry.count();
    expect(journalCount).toBe(1);
  });

  it("rejects modification of posted journal header", async () => {
    const ar = await getAccountIdByCode("1100");
    const sales = await getAccountIdByCode("4000");

    const entry = await createAndPostJournal({
      entryDate: new Date("2026-08-22"),
      lines: [
        { accountId: ar, debitInPaise: 500 },
        { accountId: sales, creditInPaise: 500 }
      ]
    });

    await expect(updateJournalEntry(entry.id, { memo: "Changed" })).rejects.toBeInstanceOf(
      PostedJournalImmutableError
    );
  });

  it("rejects deletion of posted journal line", async () => {
    const ar = await getAccountIdByCode("1100");
    const sales = await getAccountIdByCode("4000");

    const entry = await createAndPostJournal({
      entryDate: new Date("2026-08-22"),
      lines: [
        { accountId: ar, debitInPaise: 500 },
        { accountId: sales, creditInPaise: 500 }
      ]
    });

    const lineId = entry.lines[0]!.id;
    await expect(deleteJournalLine(entry.id, lineId)).rejects.toBeInstanceOf(
      PostedJournalImmutableError
    );
  });
});

describe("accounting discovery worker stub", () => {
  it("scan is skipped when native accounting disabled", async () => {
    process.env.NATIVE_ACCOUNTING_ENABLED = "0";
    const { scanPaidOrdersForMissingAccountingEvents } = await import(
      "../../src/modules/accounting/discovery-worker"
    );
    const result = await scanPaidOrdersForMissingAccountingEvents({ limit: 5 });
    expect(result.skipped).toBe(true);
  });
});
