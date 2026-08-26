import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupAccountingTestData,
  getAccountIdByCode,
  prisma,
  seedMinimalCoAForTests
} from "../helpers/commerce";
import { deactivateAccountingAccount, deleteAccountingAccount } from "../../src/modules/accounting/account.service";
import {
  InvalidPostingEventTransitionError,
  PostedJournalImmutableError,
  SystemAccountProtectedError
} from "../../src/modules/accounting/accounting-errors";
import {
  createAndPostJournal,
  deleteJournalEntry,
  deleteJournalLine,
  updateJournalEntry,
  updateJournalLine
} from "../../src/modules/accounting/journal.service";
import {
  createPostingEventPending,
  postJournalFromEvent,
  transitionPostingEventForTest
} from "../../src/modules/accounting/posting-event.service";
import {
  assertPostingEventTransition,
  canPostingEventTransition
} from "../../src/modules/accounting/posting-event-state";

describe("accounting phase 1.5 hardening", () => {
  beforeAll(async () => {
    await seedMinimalCoAForTests();
  });

  beforeEach(async () => {
    await cleanupAccountingTestData();
  });

  async function balancedPair(amount = 500) {
    const ar = await getAccountIdByCode("1100");
    const sales = await getAccountIdByCode("4000");
    return { ar, sales, amount };
  }

  describe("POSTED journal immutability", () => {
    it("rejects header update on POSTED entry", async () => {
      const { ar, sales, amount } = await balancedPair();
      const entry = await createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        memo: "immutable test",
        lines: [
          { accountId: ar, debitInPaise: amount },
          { accountId: sales, creditInPaise: amount }
        ]
      });

      await expect(updateJournalEntry(entry.id, { memo: "changed" })).rejects.toBeInstanceOf(
        PostedJournalImmutableError
      );
    });

    it("rejects currency and entryDate update on POSTED entry", async () => {
      const { ar, sales, amount } = await balancedPair();
      const entry = await createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        lines: [
          { accountId: ar, debitInPaise: amount },
          { accountId: sales, creditInPaise: amount }
        ]
      });

      await expect(
        updateJournalEntry(entry.id, { entryDate: new Date("2026-08-23"), currency: "USD" })
      ).rejects.toBeInstanceOf(PostedJournalImmutableError);
    });

    it("rejects line update and delete on POSTED entry", async () => {
      const { ar, sales, amount } = await balancedPair();
      const entry = await createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        lines: [
          { accountId: ar, debitInPaise: amount },
          { accountId: sales, creditInPaise: amount }
        ]
      });
      const lineId = entry.lines[0]!.id;

      await expect(
        updateJournalLine(entry.id, lineId, { debitInPaise: amount + 1 })
      ).rejects.toBeInstanceOf(PostedJournalImmutableError);
      await expect(deleteJournalLine(entry.id, lineId)).rejects.toBeInstanceOf(
        PostedJournalImmutableError
      );
    });

    it("rejects deleteJournalEntry on POSTED entry", async () => {
      const { ar, sales, amount } = await balancedPair();
      const entry = await createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        lines: [
          { accountId: ar, debitInPaise: amount },
          { accountId: sales, creditInPaise: amount }
        ]
      });

      await expect(deleteJournalEntry(entry.id)).rejects.toBeInstanceOf(PostedJournalImmutableError);
    });

    it("DB trigger blocks direct prisma update on POSTED header", async () => {
      const { ar, sales, amount } = await balancedPair();
      const entry = await createAndPostJournal({
        entryDate: new Date("2026-08-22"),
        lines: [
          { accountId: ar, debitInPaise: amount },
          { accountId: sales, creditInPaise: amount }
        ]
      });

      await expect(
        prisma.accountingJournalEntry.update({
          where: { id: entry.id },
          data: { memo: "direct bypass" }
        })
      ).rejects.toThrow(/immutable/i);
    });
  });

  describe("journal number concurrency", () => {
    it("assigns 20 unique entry numbers under concurrent posts", async () => {
      const { ar, sales, amount } = await balancedPair();

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          createAndPostJournal({
            entryDate: new Date("2026-08-22T12:00:00.000Z"),
            memo: `concurrent-${i}`,
            lines: [
              { accountId: ar, debitInPaise: amount },
              { accountId: sales, creditInPaise: amount }
            ]
          })
        )
      );

      expect(results).toHaveLength(20);
      results.forEach((entry) => {
        expect(entry.status).toBe("POSTED");
        expect(entry.totalDebitInPaise).toBe(amount);
        expect(entry.totalCreditInPaise).toBe(amount);
        expect(entry.totalDebitInPaise).toBe(entry.totalCreditInPaise);
      });

      const numbers = results.map((r) => r.entryNumber);
      expect(new Set(numbers).size).toBe(20);
      numbers.forEach((n) => expect(n).toMatch(/^JE-202608-\d{5}$/));

      const seq = await prisma.accountingSequence.findUnique({
        where: { sequenceType_yearMonth: { sequenceType: "JOURNAL", yearMonth: "202608" } }
      });
      expect(seq?.lastSeq).toBe(20);
    });
  });

  describe("posting event idempotency stress", () => {
    it("creates only one event for 20 concurrent ORDER_PAID attempts", async () => {
      const uniqueKey = `order:test-order-${Date.now()}`;

      const attempts = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          createPostingEventPending({
            eventType: "ORDER_PAID",
            sourceType: "ORDER",
            sourceId: "test-order-1",
            uniqueKey
          })
        )
      );

      const fulfilled = attempts.filter((a) => a.status === "fulfilled").length;
      const rejected = attempts.filter((a) => a.status === "rejected").length;
      expect(fulfilled).toBe(1);
      expect(rejected).toBe(19);

      const count = await prisma.accountingPostingEvent.count({
        where: { eventType: "ORDER_PAID", uniqueKey }
      });
      expect(count).toBe(1);
    });

    it("creates only one journal for 20 concurrent postJournalFromEvent calls", async () => {
      const { ar, sales, amount } = await balancedPair();
      const uniqueKey = `synthetic:stress:${Date.now()}`;

      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          postJournalFromEvent({
            eventType: "SYNTHETIC_SALE",
            sourceType: "TEST",
            sourceId: "stress-1",
            uniqueKey,
            entryDate: new Date("2026-08-22"),
            lines: [
              { accountId: ar, debitInPaise: amount },
              { accountId: sales, creditInPaise: amount }
            ]
          })
        )
      );

      const journalIds = new Set(results.map((r) => r.journal.id));
      expect(journalIds.size).toBe(1);

      const posted = results.filter((r) => !r.duplicate);
      expect(posted).toHaveLength(1);
      expect(results.filter((r) => r.duplicate).length).toBe(19);
      expect(results.every((r) => r.event.status === "POSTED")).toBe(true);
      expect(posted[0]!.journal.status).toBe("POSTED");
      expect(posted[0]!.journal.totalDebitInPaise).toBe(posted[0]!.journal.totalCreditInPaise);

      const eventCount = await prisma.accountingPostingEvent.count({
        where: { eventType: "SYNTHETIC_SALE", uniqueKey }
      });
      expect(eventCount).toBe(1);
    });
  });

  describe("posting event state machine", () => {
    it("allows valid transitions and rejects POSTED → PENDING", () => {
      expect(canPostingEventTransition("PENDING", "POSTED")).toBe(true);
      expect(canPostingEventTransition("FAILED", "RETRYING")).toBe(true);
      expect(canPostingEventTransition("RETRYING", "POSTED")).toBe(true);
      expect(canPostingEventTransition("POSTED", "PENDING")).toBe(false);

      expect(() => assertPostingEventTransition("POSTED", "PENDING")).toThrow(
        InvalidPostingEventTransitionError
      );
    });

    it("DB trigger blocks POSTED → FAILED downgrade", async () => {
      const event = await createPostingEventPending({
        eventType: "TEST_EVENT",
        sourceType: "TEST",
        sourceId: "e1",
        uniqueKey: `downgrade-${Date.now()}`
      });

      await transitionPostingEventForTest(event.id, "POSTED");

      await expect(
        prisma.accountingPostingEvent.update({
          where: { id: event.id },
          data: { status: "FAILED" }
        })
      ).rejects.toThrow(/POSTED posting events cannot transition/i);
    });
  });

  describe("accounting period control", () => {
    it("rejects posting into a CLOSED period", async () => {
      await prisma.accountingPeriod.create({
        data: {
          name: "FY Test Closed",
          startDate: new Date("2026-08-01"),
          endDate: new Date("2026-08-31"),
          status: "CLOSED",
          closedAt: new Date()
        }
      });

      const { ar, sales, amount } = await balancedPair();

      await expect(
        createAndPostJournal({
          entryDate: new Date("2026-08-15"),
          lines: [
            { accountId: ar, debitInPaise: amount },
            { accountId: sales, creditInPaise: amount }
          ]
        })
      ).rejects.toMatchObject({ code: "ACCOUNTING_PERIOD_CLOSED" });

      await prisma.accountingPeriod.deleteMany({ where: { name: "FY Test Closed" } });
    });

    it("allows posting into OPEN period", async () => {
      await prisma.accountingPeriod.create({
        data: {
          name: "FY Test Open",
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-07-31"),
          status: "OPEN"
        }
      });

      const { ar, sales, amount } = await balancedPair();
      const entry = await createAndPostJournal({
        entryDate: new Date("2026-07-15"),
        lines: [
          { accountId: ar, debitInPaise: amount },
          { accountId: sales, creditInPaise: amount }
        ]
      });
      expect(entry.status).toBe("POSTED");

      await prisma.accountingPeriod.deleteMany({ where: { name: "FY Test Open" } });
    });
  });

  describe("system account protection", () => {
    it("prevents delete and deactivation of system accounts", async () => {
      const sales = await prisma.accountingAccount.findUniqueOrThrow({ where: { code: "4000" } });

      await expect(deleteAccountingAccount(sales.id)).rejects.toBeInstanceOf(
        SystemAccountProtectedError
      );
      await expect(deactivateAccountingAccount(sales.id)).rejects.toBeInstanceOf(
        SystemAccountProtectedError
      );
    });
  });

  describe("database constraints", () => {
    it("rejects invalid accounting period dates", async () => {
      await expect(
        prisma.accountingPeriod.create({
          data: {
            name: "Invalid",
            startDate: new Date("2026-08-31"),
            endDate: new Date("2026-08-01"),
            status: "OPEN"
          }
        })
      ).rejects.toThrow();
    });

    it("rejects journal line with both debit and credit via DB check", async () => {
      const { ar, sales, amount } = await balancedPair();
      const entry = await prisma.accountingJournalEntry.create({
        data: {
          entryNumber: `JE-TEST-${Date.now()}`,
          entryDate: new Date("2026-08-22"),
          status: "DRAFT",
          totalDebitInPaise: amount,
          totalCreditInPaise: amount
        }
      });

      await expect(
        prisma.accountingJournalLine.create({
          data: {
            journalEntryId: entry.id,
            accountId: ar,
            debitInPaise: 100,
            creditInPaise: 100
          }
        })
      ).rejects.toThrow();

      await prisma.accountingJournalEntry.delete({ where: { id: entry.id } });
    });
  });
});
