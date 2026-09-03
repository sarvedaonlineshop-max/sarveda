/**
 * Working-day SLA helpers for Return Cases.
 *
 * Convention: Mon–Fri are working days. Saturday/Sunday are excluded.
 * Holiday calendar is extensible via config key `sla_holiday_dates` (ISO date strings)
 * when provided; no invented holiday list is shipped by default.
 */
import type { OrderServiceRequestEventType } from "@prisma/client";

import { prisma } from "../../config/db";
import { getReturnPolicyNumber, getReturnPolicyConfig } from "./return-policy-config.service";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export async function loadHolidaySet(): Promise<Set<string>> {
  const raw = await getReturnPolicyConfig("sla_holiday_dates");
  const set = new Set<string>();
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) set.add(v);
    }
  }
  return set;
}

export function addWorkingDays(from: Date, workingDays: number, holidays: Set<string>): Date {
  if (workingDays <= 0) return new Date(from);
  let remaining = workingDays;
  const cursor = startOfUtcDay(from);
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    if (isWeekend(cursor) || holidays.has(iso)) continue;
    remaining -= 1;
  }
  return cursor;
}

export function countWorkingDaysBetween(from: Date, to: Date, holidays: Set<string>): number {
  if (to.getTime() <= from.getTime()) return 0;
  let count = 0;
  const cursor = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  while (cursor.getTime() < end.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    if (isWeekend(cursor) || holidays.has(iso)) continue;
    count += 1;
  }
  return count;
}

export type SlaStage =
  | "FIRST_REVIEW"
  | "APPROVAL"
  | "PICKUP"
  | "WAREHOUSE"
  | "QC"
  | "REFUND_INITIATION"
  | "REFUND_COMPLETION"
  | "REPLACEMENT_DELIVERY";

const STAGE_EVENTS: Record<SlaStage, { start: OrderServiceRequestEventType[]; end: OrderServiceRequestEventType[] }> = {
  FIRST_REVIEW: { start: ["CASE_CREATED"], end: ["REVIEWED", "APPROVED", "REJECTED", "MORE_INFO_REQUESTED"] },
  APPROVAL: { start: ["CASE_CREATED"], end: ["APPROVED", "REJECTED"] },
  PICKUP: { start: ["APPROVED", "PICKUP_REQUESTED"], end: ["CUSTOMER_SELF_SHIP_SUBMITTED", "ITEM_RECEIVED"] },
  WAREHOUSE: { start: ["PICKUP_REQUESTED", "CUSTOMER_SELF_SHIP_SUBMITTED"], end: ["ITEM_RECEIVED"] },
  QC: { start: ["ITEM_RECEIVED"], end: ["QC_PERFORMED", "DISPOSITION_SELECTED"] },
  REFUND_INITIATION: { start: ["REFUND_APPROVED", "ITEM_RECEIVED", "QC_PERFORMED"], end: ["REFUND_INITIATED", "REFUND_COMPLETED"] },
  REFUND_COMPLETION: { start: ["REFUND_INITIATED"], end: ["REFUND_COMPLETED"] },
  REPLACEMENT_DELIVERY: { start: ["REPLACEMENT_INITIATED"], end: ["REPLACEMENT_DELIVERED"] }
};

export async function measureCaseSla(requestId: string) {
  const request = await prisma.orderServiceRequest.findUnique({
    where: { id: requestId },
    include: { events: { orderBy: { createdAt: "asc" } } }
  });
  if (!request) return null;

  const holidays = await loadHolidaySet();
  const refundWorkingDays = await getReturnPolicyNumber("sla_refund_working_days", 7);
  const firstReviewDays = await getReturnPolicyNumber("sla_first_review_working_days", 2);

  const findFirst = (types: OrderServiceRequestEventType[]) =>
    request.events.find((e) => types.includes(e.eventType));

  const stages: Array<{
    stage: SlaStage;
    startAt: Date | null;
    endAt: Date | null;
    elapsedWorkingDays: number | null;
    targetWorkingDays: number | null;
    overdue: boolean;
    paused: boolean;
  }> = [];

  for (const stage of Object.keys(STAGE_EVENTS) as SlaStage[]) {
    const cfg = STAGE_EVENTS[stage];
    const start = findFirst(cfg.start);
    const end = findFirst(cfg.end);
    const startAt = start?.createdAt ?? (stage === "FIRST_REVIEW" ? request.createdAt : null);
    const endAt = end?.createdAt ?? null;
    const paused = Boolean(request.slaPausedAt) && !endAt;
    let elapsed: number | null = null;
    if (startAt && endAt) {
      elapsed = countWorkingDaysBetween(startAt, endAt, holidays);
    } else if (startAt && !endAt && !paused) {
      elapsed = countWorkingDaysBetween(startAt, new Date(), holidays);
    }
    const target =
      stage === "REFUND_INITIATION" || stage === "REFUND_COMPLETION"
        ? refundWorkingDays
        : stage === "FIRST_REVIEW"
          ? firstReviewDays
          : null;
    stages.push({
      stage,
      startAt,
      endAt,
      elapsedWorkingDays: elapsed,
      targetWorkingDays: target,
      overdue: target != null && elapsed != null && elapsed > target && !endAt,
      paused
    });
  }

  // Refund due date: after approval (no physical) or after receipt+QC (physical).
  let refundDueAt = request.refundSlaDueAt;
  if (!refundDueAt) {
    const approved = findFirst(["APPROVED", "REFUND_APPROVED"]);
    const received = findFirst(["ITEM_RECEIVED"]);
    const qc = findFirst(["QC_PERFORMED", "DISPOSITION_SELECTED"]);
    const anchor =
      request.returnPhysicalStatus === "NOT_REQUIRED"
        ? approved?.createdAt ?? request.refundApprovedAt
        : qc?.createdAt ?? received?.createdAt ?? null;
    if (anchor) {
      refundDueAt = addWorkingDays(anchor, refundWorkingDays, holidays);
    }
  }

  return {
    requestId,
    caseNumber: request.caseNumber,
    slaPausedAt: request.slaPausedAt,
    refundSlaDueAt: refundDueAt,
    calculation:
      "Working days = Mon–Fri excluding weekends; optional holiday ISO dates from config sla_holiday_dates; no default holiday list invented.",
    stages
  };
}

export async function listOverdueReturnCases(limit = 50) {
  const now = new Date();
  const rows = await prisma.orderServiceRequest.findMany({
    where: {
      type: "REFUND_AFTER_DELIVERY",
      status: { in: ["APPROVED", "PENDING_APPROVAL", "MORE_INFO_REQUIRED"] },
      OR: [
        { refundSlaDueAt: { lt: now }, refundCompletedAt: null },
        { highValueApprovalRequired: true, highValueApprovedAt: null }
      ]
    },
    orderBy: { refundSlaDueAt: "asc" },
    take: limit,
    select: {
      id: true,
      caseNumber: true,
      orderNumber: true,
      status: true,
      resolutionStatus: true,
      refundSlaDueAt: true,
      slaPausedAt: true,
      highValueApprovalRequired: true,
      highValueApprovedAt: true,
      createdAt: true
    }
  });
  return rows;
}

/** Persist refund SLA due date after approval when not paused. */
export async function setRefundSlaDueAfterApproval(requestId: string): Promise<void> {
  const request = await prisma.orderServiceRequest.findUnique({ where: { id: requestId } });
  if (!request || request.refundSlaDueAt) return;
  const holidays = await loadHolidaySet();
  const days = await getReturnPolicyNumber("sla_refund_working_days", 7);
  const anchor = request.refundApprovedAt ?? request.reviewedAt ?? new Date();
  const due = addWorkingDays(anchor, days, holidays);
  await prisma.orderServiceRequest.update({
    where: { id: requestId },
    data: { refundSlaDueAt: due }
  });
}
