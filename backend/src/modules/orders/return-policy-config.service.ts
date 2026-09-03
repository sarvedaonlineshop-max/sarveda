import type { Prisma } from "@prisma/client";

import { prisma } from "../../config/db";

const DEFAULTS: Record<string, unknown> = {
  return_window_days: 7,
  replacement_window_days: 7,
  high_value_approval_threshold_paise: null,
  sla_refund_working_days: 7,
  sla_first_review_working_days: 2,
  alert_sku_return_rate_pct: 15,
  alert_lookback_days: 90
};

export async function getReturnPolicyConfig(key: string): Promise<unknown> {
  const row = await prisma.returnPolicyConfig.findUnique({ where: { key } });
  if (row) return row.valueJson;
  return DEFAULTS[key] ?? null;
}

export async function getReturnPolicyNumber(key: string, fallback: number): Promise<number> {
  const v = await getReturnPolicyConfig(key);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

export async function listReturnPolicyConfigs() {
  const rows = await prisma.returnPolicyConfig.findMany({ orderBy: { key: "asc" } });
  const keys = new Set(rows.map((r) => r.key));
  const missing = Object.entries(DEFAULTS)
    .filter(([k]) => !keys.has(k))
    .map(([key, valueJson]) => ({
      id: null as string | null,
      key,
      valueJson: valueJson as Prisma.JsonValue,
      description: null as string | null,
      updatedByEmail: null as string | null,
      updatedAt: null as Date | null
    }));
  return [...rows, ...missing];
}

export async function setReturnPolicyConfig(opts: {
  key: string;
  valueJson: Prisma.InputJsonValue;
  description?: string;
  actorUserId?: string;
  actorEmail?: string;
}) {
  // Never allow accounting core accounting invariants via this surface.
  const forbidden = new Set([
    "refund_allocation_required",
    "gst_inclusive_pricing",
    "inventory_sellable_without_qc"
  ]);
  if (forbidden.has(opts.key)) {
    throw Object.assign(new Error("This configuration key is not editable"), {
      statusCode: 400,
      code: "CONFIG_NOT_EDITABLE"
    });
  }

  const existing = await prisma.returnPolicyConfig.findUnique({ where: { key: opts.key } });
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.returnPolicyConfig.upsert({
      where: { key: opts.key },
      create: {
        key: opts.key,
        valueJson: opts.valueJson,
        description: opts.description ?? null,
        updatedByUserId: opts.actorUserId ?? null,
        updatedByEmail: opts.actorEmail ?? null
      },
      update: {
        valueJson: opts.valueJson,
        description: opts.description ?? undefined,
        updatedByUserId: opts.actorUserId ?? null,
        updatedByEmail: opts.actorEmail ?? null
      }
    });
    await tx.returnPolicyConfigAudit.create({
      data: {
        configKey: opts.key,
        beforeJson: existing?.valueJson ?? undefined,
        afterJson: opts.valueJson,
        actorUserId: opts.actorUserId ?? null,
        actorEmail: opts.actorEmail ?? null
      }
    });
    return row;
  });
  return updated;
}

/**
 * High-value gate: when threshold is null/unset, enforcement is disabled
 * (POLICY_DECISION_REQUIRED). When set, refunds at/above threshold require manager approval.
 */
export async function assertHighValueApprovalIfRequired(opts: {
  requestId: string;
  refundAmountPaise: number;
}): Promise<void> {
  const threshold = await getReturnPolicyConfig("high_value_approval_threshold_paise");
  if (threshold == null || typeof threshold !== "number") {
    return; // disabled until Arjun sets threshold
  }
  if (opts.refundAmountPaise < threshold) return;

  const request = await prisma.orderServiceRequest.findUnique({ where: { id: opts.requestId } });
  if (!request) return;
  if (!request.highValueApprovedAt) {
    await prisma.orderServiceRequest.update({
      where: { id: opts.requestId },
      data: { highValueApprovalRequired: true }
    });
    throw Object.assign(
      new Error(
        `Refund of ${opts.refundAmountPaise / 100} requires manager approval (threshold ${threshold / 100})`
      ),
      { statusCode: 409, code: "HIGH_VALUE_APPROVAL_REQUIRED" }
    );
  }
}

export async function approveHighValueRefund(opts: {
  requestId: string;
  adminEmail: string;
  adminUserId?: string;
  note?: string;
}) {
  const updated = await prisma.orderServiceRequest.update({
    where: { id: opts.requestId },
    data: {
      highValueApprovalRequired: true,
      highValueApprovedAt: new Date(),
      highValueApprovedByEmail: opts.adminEmail,
      highValueApprovalNote: opts.note?.trim() || null
    }
  });
  const { appendCaseEvent } = await import("./return-case-events.service");
  await appendCaseEvent({
    requestId: opts.requestId,
    eventType: "NOTE_ADDED",
    message: `High-value refund approved by ${opts.adminEmail}`,
    payloadJson: { note: opts.note ?? null },
    actor: { userId: opts.adminUserId, email: opts.adminEmail, role: "ADMIN" }
  });
  return updated;
}
