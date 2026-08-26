import type { AccountingPostingEventStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

import { writeAccountingAuditLog } from "./accounting-audit.service";
import {
  DuplicatePostingEventError,
  PostingEventAlreadyPostedError
} from "./accounting-errors";
import {
  createAndPostJournalInTx,
  type CreateAndPostJournalInput
} from "./journal.service";
import { assertPostingEventTransition } from "./posting-event-state";

export type CreatePostingEventInput = {
  eventType: string;
  sourceType: string;
  sourceId: string;
  uniqueKey: string;
  payloadJson?: Prisma.InputJsonValue;
};

export type PostJournalFromEventInput = CreatePostingEventInput &
  Omit<CreateAndPostJournalInput, "postedByUserId"> & {
    postedByUserId?: string;
  };

async function lockPostingEvent(tx: Prisma.TransactionClient, eventId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "AccountingPostingEvent" WHERE id = ${eventId}::uuid FOR UPDATE
  `;
  if (!rows[0]) {
    throw Object.assign(new Error("Posting event not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
}

async function getOrCreatePostingEvent(
  tx: Prisma.TransactionClient,
  input: CreatePostingEventInput
) {
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "AccountingPostingEvent" (
      "id",
      "eventType",
      "sourceType",
      "sourceId",
      "uniqueKey",
      "payloadJson",
      "status",
      "attemptCount",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      gen_random_uuid(),
      ${input.eventType},
      ${input.sourceType},
      ${input.sourceId},
      ${input.uniqueKey},
      ${input.payloadJson ?? null}::jsonb,
      'PENDING'::"AccountingPostingEventStatus",
      0,
      NOW(),
      NOW()
    )
    ON CONFLICT ("eventType", "uniqueKey") DO NOTHING
    RETURNING id
  `;

  let eventId = inserted[0]?.id;
  if (!eventId) {
    const existing = await tx.accountingPostingEvent.findUnique({
      where: {
        eventType_uniqueKey: {
          eventType: input.eventType,
          uniqueKey: input.uniqueKey
        }
      },
      select: { id: true }
    });
    if (!existing) {
      throw new DuplicatePostingEventError(input.uniqueKey);
    }
    eventId = existing.id;
  }

  await lockPostingEvent(tx, eventId);
  return tx.accountingPostingEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: { journalEntry: { include: { lines: true } } }
  });
}

function transitionStatus(
  current: AccountingPostingEventStatus,
  next: AccountingPostingEventStatus
): void {
  assertPostingEventTransition(current, next);
}

/**
 * Idempotent posting: same (eventType, uniqueKey) never creates a second journal.
 * Journal + event status update occur in ONE transaction.
 */
export async function postJournalFromEvent(input: PostJournalFromEventInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const event = await getOrCreatePostingEvent(tx, input);

      if (event.status === "POSTED" && event.journalEntry) {
        return { event, journal: event.journalEntry, duplicate: true as const };
      }

      if (event.status === "POSTED" && !event.journalEntry) {
        throw new PostingEventAlreadyPostedError(input.uniqueKey);
      }

      if (event.status === "SKIPPED") {
        throw new DuplicatePostingEventError(input.uniqueKey);
      }

      let workingStatus = event.status;

      if (event.status === "FAILED") {
        transitionStatus("FAILED", "RETRYING");
        await tx.accountingPostingEvent.update({
          where: { id: event.id },
          data: { status: "RETRYING", attemptCount: { increment: 1 } }
        });
        workingStatus = "RETRYING";
        await writeAccountingAuditLog(
          {
            action: "POSTING_RETRY",
            entityType: "AccountingPostingEvent",
            entityId: event.id,
            afterJson: { eventType: input.eventType, uniqueKey: input.uniqueKey }
          },
          tx
        );
      }

      const journal = await createAndPostJournalInTx(tx, {
        entryDate: input.entryDate,
        memo: input.memo,
        lines: input.lines,
        postedByUserId: input.postedByUserId,
        currency: input.currency
      });

      transitionStatus(workingStatus, "POSTED");

      const updated = await tx.accountingPostingEvent.update({
        where: { id: event.id },
        data: {
          status: "POSTED",
          journalEntryId: journal.id,
          processedAt: new Date(),
          attemptCount: { increment: workingStatus === "PENDING" ? 1 : 0 },
          lastError: null
        },
        include: { journalEntry: { include: { lines: true } } }
      });

      return { event: updated, journal, duplicate: false as const };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await prisma.accountingPostingEvent
      .updateMany({
        where: {
          eventType: input.eventType,
          uniqueKey: input.uniqueKey,
          status: { in: ["PENDING", "RETRYING"] }
        },
        data: {
          status: "FAILED",
          attemptCount: { increment: 1 },
          lastError: message.slice(0, 4000)
        }
      })
      .catch(() => undefined);

    await writeAccountingAuditLog({
      action: "POSTING_FAILED",
      entityType: "AccountingPostingEvent",
      entityId: `${input.eventType}:${input.uniqueKey}`,
      afterJson: { error: message.slice(0, 500) }
    }).catch(() => undefined);

    logger.error("accounting_posting_event_failed", {
      eventType: input.eventType,
      uniqueKey: input.uniqueKey,
      err: message
    });
    throw err;
  }
}

/** Create posting event row only (no journal) — for future discovery worker dry-run paths. */
export async function createPostingEventPending(input: CreatePostingEventInput) {
  try {
    return await prisma.accountingPostingEvent.create({
      data: {
        ...input,
        status: "PENDING"
      }
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      throw new DuplicatePostingEventError(input.uniqueKey);
    }
    throw err;
  }
}

export async function getPostingEvent(eventType: string, uniqueKey: string) {
  return prisma.accountingPostingEvent.findUnique({
    where: { eventType_uniqueKey: { eventType, uniqueKey } },
    include: { journalEntry: true }
  });
}

export async function transitionPostingEventForTest(
  eventId: string,
  toStatus: AccountingPostingEventStatus
) {
  const event = await prisma.accountingPostingEvent.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("not found");
  transitionStatus(event.status, toStatus);
  return prisma.accountingPostingEvent.update({
    where: { id: eventId },
    data: { status: toStatus }
  });
}
