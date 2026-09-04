import type {
  OrderServiceRequestStatus,
  Prisma,
  ReturnCaseChannel,
  ReturnResponsibleTeam,
  ReturnRootCause,
  ReturnShippingRefundPolicy
} from "@prisma/client";

import { prisma } from "../../config/db";
import { appendCaseEvent, listCaseEvents, serializeCaseEventForCustomer } from "./return-case-events.service";
import { shippingPolicyForReason } from "./return-replacement.constants";
import { uploadRequestPhotos } from "./order-service-request.service";

/**
 * Root-cause → shipping policy branching (Arjun SOP).
 * Customer reason is preserved; internal conclusion drives financial treatment.
 */
export function shippingPolicyForRootCause(
  rootCause: ReturnRootCause,
  customerReasonCode: string | null | undefined
): ReturnShippingRefundPolicy {
  switch (rootCause) {
    case "SARVEDA_DISPATCH":
    case "SARVEDA_LISTING_CONTENT":
    case "PRODUCT_VENDOR_QC":
    case "LOGISTICS_COURIER":
      return "SHIPPING_REFUNDABLE";
    case "CUSTOMER":
      return "SHIPPING_RETAINED";
    case "UNDETERMINED":
    default:
      // arrived_late / other stay manual unless a configurable policy exists.
      if (customerReasonCode === "arrived_late" || customerReasonCode === "other") {
        return "MANUAL_REVIEW";
      }
      return shippingPolicyForReason(customerReasonCode ?? "other");
  }
}

export async function setReturnCaseRootCause(opts: {
  orderId: string;
  requestId: string;
  rootCause: ReturnRootCause;
  rootCauseNote?: string;
  responsibleTeam?: ReturnResponsibleTeam;
  responsibleUserId?: string;
  responsibleUserEmail?: string;
  secondaryReasonCode?: string;
  secondaryReasonLabel?: string;
  adminEmail: string;
  adminUserId?: string;
}): Promise<void> {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId }
  });
  if (!request) {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const shippingRefundPolicy = shippingPolicyForRootCause(opts.rootCause, request.reasonCode);

  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: {
      rootCause: opts.rootCause,
      rootCauseNote: opts.rootCauseNote?.trim() || null,
      responsibleTeam: opts.responsibleTeam ?? null,
      responsibleUserId: opts.responsibleUserId ?? null,
      responsibleUserEmail: opts.responsibleUserEmail ?? null,
      secondaryReasonCode: opts.secondaryReasonCode?.trim() || null,
      secondaryReasonLabel: opts.secondaryReasonLabel?.trim() || null,
      shippingRefundPolicy
    }
  });

  await appendCaseEvent({
    requestId: request.id,
    eventType: "ROOT_CAUSE_SET",
    message: `Root cause set to ${opts.rootCause}`,
    payloadJson: {
      rootCause: opts.rootCause,
      shippingRefundPolicy,
      responsibleTeam: opts.responsibleTeam ?? null
    },
    actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
  });
}

export async function requestMoreInfo(opts: {
  orderId: string;
  requestId: string;
  prompt: string;
  adminEmail: string;
  adminUserId?: string;
}): Promise<void> {
  const prompt = opts.prompt.trim();
  if (!prompt) {
    throw Object.assign(new Error("Describe what information is needed"), {
      statusCode: 400,
      code: "PROMPT_REQUIRED"
    });
  }

  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId }
  });
  if (!request) {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (!["PENDING_APPROVAL", "MORE_INFO_REQUIRED", "NEEDS_DISCUSSION"].includes(request.status)) {
    throw Object.assign(new Error("Case is not awaiting customer information"), {
      statusCode: 409,
      code: "INVALID_STATUS"
    });
  }

  const now = new Date();
  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: {
      status: "MORE_INFO_REQUIRED",
      moreInfoPrompt: prompt,
      moreInfoRequestedAt: now,
      moreInfoResponse: null,
      moreInfoRespondedAt: null,
      slaPausedAt: now
    }
  });

  await appendCaseEvent({
    requestId: request.id,
    eventType: "MORE_INFO_REQUESTED",
    message: prompt,
    actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
  });

  void (async () => {
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    await notifyReturnCaseEvent(request.id, "RETURN_MORE_INFO_REQUIRED", {
      orderNumber: request.orderNumber,
      caseNumber: request.caseNumber,
      customerEmail: request.customerEmail,
      itemSummary: "",
      moreInfoPrompt: prompt
    });
  })();
}

export async function provideMoreInfo(opts: {
  orderNumber: string;
  requestId: string;
  userId: string;
  userEmail: string;
  response: string;
  photos?: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
}): Promise<void> {
  const email = opts.userEmail.trim().toLowerCase();
  const request = await prisma.orderServiceRequest.findFirst({
    where: {
      id: opts.requestId,
      orderNumber: opts.orderNumber,
      OR: [{ customerId: opts.userId }, { customerEmail: email }]
    }
  });
  if (!request) {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.status !== "MORE_INFO_REQUIRED") {
    throw Object.assign(new Error("This case is not waiting for more information"), {
      statusCode: 409,
      code: "INVALID_STATUS"
    });
  }

  const response = opts.response.trim();
  if (!response && !(opts.photos?.length)) {
    throw Object.assign(new Error("Add a response or evidence"), {
      statusCode: 400,
      code: "RESPONSE_REQUIRED"
    });
  }

  const now = new Date();
  if (opts.photos?.length) {
    const photoRows = await uploadRequestPhotos(request.id, opts.photos);
    await prisma.orderServiceRequestPhoto.createMany({
      data: photoRows.map((p) => ({
        requestId: request.id,
        s3Key: p.s3Key,
        s3Url: p.s3Url,
        fileName: p.fileName,
        fileSizeBytes: p.fileSizeBytes,
        mimeType: p.mimeType ?? null,
        mediaKind: p.mediaKind ?? "IMAGE"
      }))
    });
    await appendCaseEvent({
      requestId: request.id,
      eventType: "EVIDENCE_ADDED",
      message: `${opts.photos.length} evidence file(s) added`,
      actor: { userId: opts.userId, email, role: "CUSTOMER" }
    });
  }

  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: {
      status: "PENDING_APPROVAL",
      moreInfoResponse: response || null,
      moreInfoRespondedAt: now,
      slaPausedAt: null
    }
  });

  await appendCaseEvent({
    requestId: request.id,
    eventType: "MORE_INFO_PROVIDED",
    message: response || "Additional evidence provided",
    actor: { userId: opts.userId, email, role: "CUSTOMER" }
  });
}

export async function submitCustomerSelfShip(opts: {
  orderNumber: string;
  requestId: string;
  userId: string;
  userEmail: string;
  courier: string;
  awb: string;
  shippedAt?: Date;
  trackingUrl?: string;
}): Promise<void> {
  const email = opts.userEmail.trim().toLowerCase();
  const request = await prisma.orderServiceRequest.findFirst({
    where: {
      id: opts.requestId,
      orderNumber: opts.orderNumber,
      OR: [{ customerId: opts.userId }, { customerEmail: email }]
    },
    include: { returnShipment: true }
  });
  if (!request) {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }
  if (request.status !== "APPROVED") {
    throw Object.assign(new Error("Self-ship tracking can be submitted after approval"), {
      statusCode: 409,
      code: "INVALID_STATUS"
    });
  }

  const courier = opts.courier.trim();
  const awb = opts.awb.trim();
  if (!courier || !awb) {
    throw Object.assign(new Error("Courier and tracking/AWB are required"), {
      statusCode: 400,
      code: "TRACKING_REQUIRED"
    });
  }

  if (request.returnShipment) {
    await prisma.orderReturnShipment.update({
      where: { id: request.returnShipment.id },
      data: {
        mode: "MANUAL_RETURN_SHIPMENT",
        courier,
        awb,
        trackingUrl: opts.trackingUrl?.trim() || null,
        physicalStatus: "IN_TRANSIT"
      }
    });
  } else {
    await prisma.orderReturnShipment.create({
      data: {
        requestId: request.id,
        orderId: request.orderId,
        mode: "MANUAL_RETURN_SHIPMENT",
        courier,
        awb,
        trackingUrl: opts.trackingUrl?.trim() || null,
        physicalStatus: "IN_TRANSIT"
      }
    });
  }

  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: { returnPhysicalStatus: "IN_TRANSIT" }
  });

  await appendCaseEvent({
    requestId: request.id,
    eventType: "CUSTOMER_SELF_SHIP_SUBMITTED",
    message: `${courier} / ${awb}`,
    payloadJson: {
      courier,
      awb,
      shippedAt: opts.shippedAt?.toISOString() ?? null,
      trackingUrl: opts.trackingUrl ?? null
    },
    actor: { userId: opts.userId, email, role: "CUSTOMER" }
  });

  void (async () => {
    const { notifyReturnCaseEvent } = await import("./return-case-notifications.service");
    await notifyReturnCaseEvent(request.id, "RETURN_SELF_SHIP", {
      orderNumber: request.orderNumber,
      caseNumber: request.caseNumber,
      customerEmail: request.customerEmail,
      itemSummary: "",
      courier,
      awb,
      trackingUrl: opts.trackingUrl ?? null,
      selfShip: true
    });
  })();
}

export type ReturnCaseListFilters = {
  status?: OrderServiceRequestStatus;
  /** Operational stage filter (maps to status/physical/resolution). */
  stage?: import("./return-case-stage").ReturnCaseStage;
  type?: string;
  channel?: ReturnCaseChannel;
  rootCause?: ReturnRootCause;
  q?: string;
  page?: number;
  pageSize?: number;
};

export async function listReturnCases(filters: ReturnCaseListFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const { deriveReturnCaseStage, stageToWhere, RETURN_CASE_STAGE_LABELS } = await import(
    "./return-case-stage"
  );

  const where: Prisma.OrderServiceRequestWhereInput = {
    type: { in: ["REFUND_AFTER_DELIVERY", "CANCEL_BEFORE_DELIVERY"] }
  };
  if (filters.stage) {
    Object.assign(where, stageToWhere(filters.stage));
  } else if (filters.status) {
    where.status = filters.status;
  }
  if (filters.type) where.type = filters.type as Prisma.EnumOrderServiceRequestTypeFilter["equals"];
  if (filters.channel) where.channel = filters.channel;
  if (filters.rootCause) where.rootCause = filters.rootCause;
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { caseNumber: { contains: q, mode: "insensitive" } },
      { orderNumber: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { reasonLabel: { contains: q, mode: "insensitive" } }
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.orderServiceRequest.count({ where }),
    prisma.orderServiceRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        caseNumber: true,
        orderId: true,
        orderNumber: true,
        customerEmail: true,
        type: true,
        status: true,
        channel: true,
        reasonCode: true,
        reasonLabel: true,
        rootCause: true,
        responsibleTeam: true,
        returnPhysicalStatus: true,
        resolutionStatus: true,
        refundTotalInPaise: true,
        refundApprovedAt: true,
        refundInitiatedAt: true,
        refundCompletedAt: true,
        refundProcessedAt: true,
        refundSlaDueAt: true,
        slaPausedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            nameSnapshot: true,
            skuSnapshot: true,
            qtySelected: true,
            reasonLabel: true,
            requestedResolution: true
          }
        }
      }
    })
  ]);

  const now = Date.now();
  const enriched = rows.map((row) => {
    const stage = deriveReturnCaseStage(row);
    const ageHours = Math.max(0, Math.round((now - row.createdAt.getTime()) / 3600000));
    const slaOverdue =
      Boolean(row.refundSlaDueAt) &&
      row.refundSlaDueAt!.getTime() < now &&
      !row.refundProcessedAt &&
      row.status !== "REJECTED";
    return {
      ...row,
      stage,
      stageLabel: RETURN_CASE_STAGE_LABELS[stage],
      ageHours,
      slaOverdue,
      itemSummary: row.items.map((i) => `${i.nameSnapshot} × ${i.qtySelected}`).join("; "),
      qtyRequested: row.items.reduce((s, i) => s + i.qtySelected, 0),
      requestedResolutions: [
        ...new Set(row.items.map((i) => i.requestedResolution).filter(Boolean))
      ]
    };
  });

  return { total, page, pageSize, rows: enriched };
}

/** Full admin desk payload for one return case (by human case number). */
export async function getAdminReturnCaseByCaseNumber(caseNumber: string) {
  const { deriveReturnCaseStage, RETURN_CASE_STAGE_LABELS } = await import("./return-case-stage");
  const { listCaseEvents } = await import("./return-case-events.service");

  const request = await prisma.orderServiceRequest.findFirst({
    where: { caseNumber: caseNumber.trim() },
    include: {
      photos: true,
      items: { include: { photos: true } },
      returnShipment: true,
      replacementFulfillments: true,
      receiptLines: true,
      qcLines: true,
      economics: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          email: true,
          phone: true,
          currency: true,
          grandTotalInPaise: true,
          discountInPaise: true,
          shippingInPaise: true,
          paymentStatus: true,
          status: true,
          items: {
            select: {
              id: true,
              nameSnapshot: true,
              skuSnapshot: true,
              qtyOrdered: true,
              lineTotalInPaise: true,
              unitPriceInPaise: true
            }
          },
          payments: {
            where: { status: "CAPTURED" },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              provider: true,
              amountInPaise: true,
              refundedInPaise: true,
              status: true
            }
          }
        }
      }
    }
  });

  if (!request) {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const events = await listCaseEvents(request.id);
  const stage = deriveReturnCaseStage(request);
  const payment = request.order.payments[0] ?? null;

  return {
    request: {
      id: request.id,
      caseNumber: request.caseNumber,
      orderId: request.orderId,
      orderNumber: request.orderNumber,
      customerEmail: request.customerEmail,
      type: request.type,
      status: request.status,
      channel: request.channel,
      reasonCode: request.reasonCode,
      reasonLabel: request.reasonLabel,
      message: request.message,
      otherMessage: request.otherMessage,
      adminNote: request.adminNote,
      moreInfoPrompt: request.moreInfoPrompt,
      moreInfoResponse: request.moreInfoResponse,
      declarationsJson: request.declarationsJson,
      declarationsAcceptedAt: request.declarationsAcceptedAt,
      returnPhysicalStatus: request.returnPhysicalStatus,
      resolutionStatus: request.resolutionStatus,
      shippingRefundPolicy: request.shippingRefundPolicy,
      refundTotalInPaise: request.refundTotalInPaise,
      refundProcessedAt: request.refundProcessedAt,
      refundProviderReference: request.refundProviderReference,
      calculatedRefundPaise: request.calculatedRefundPaise,
      approvedOverrideRefundPaise: request.approvedOverrideRefundPaise,
      overrideDifferencePaise: request.overrideDifferencePaise,
      overrideReason: request.overrideReason,
      overrideActorEmail: request.overrideActorEmail,
      overrideAt: request.overrideAt,
      overrideGoodwillPaise: request.overrideGoodwillPaise,
      rootCause: request.rootCause,
      rootCauseNote: request.rootCauseNote,
      responsibleTeam: request.responsibleTeam,
      responsibleUserEmail: request.responsibleUserEmail,
      secondaryReasonCode: request.secondaryReasonCode,
      secondaryReasonLabel: request.secondaryReasonLabel,
      highValueApprovalRequired: request.highValueApprovalRequired,
      refundSlaDueAt: request.refundSlaDueAt,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt,
      reviewedByEmail: request.reviewedByEmail,
      closedAt: request.closedAt,
      photos: request.photos,
      items: request.items,
      returnShipment: request.returnShipment,
      replacementFulfillments: request.replacementFulfillments,
      receiptLines: request.receiptLines,
      qcLines: request.qcLines
    },
    order: request.order,
    paymentProvider: payment?.provider ?? null,
    stage,
    stageLabel: RETURN_CASE_STAGE_LABELS[stage],
    events
  };
}

/** Customer-facing case snapshot — strips internal accountability fields. */
export async function getCustomerReturnCase(opts: {
  orderNumber: string;
  requestId: string;
  userId: string;
  userEmail: string;
}) {
  const email = opts.userEmail.trim().toLowerCase();
  const request = await prisma.orderServiceRequest.findFirst({
    where: {
      id: opts.requestId,
      orderNumber: opts.orderNumber,
      OR: [{ customerId: opts.userId }, { customerEmail: email }]
    },
    include: {
      items: { select: { id: true, nameSnapshot: true, skuSnapshot: true, qtySelected: true, reasonLabel: true, requestedResolution: true } },
      returnShipment: {
        select: {
          mode: true,
          courier: true,
          awb: true,
          trackingUrl: true,
          physicalStatus: true,
          receivedAt: true
        }
      },
      replacementFulfillments: {
        select: {
          id: true,
          status: true,
          shippedAt: true,
          deliveredAt: true,
          qty: true
        }
      }
    }
  });
  if (!request) return null;

  const events = await listCaseEvents(request.id);
  const timeline = events
    .map(serializeCaseEventForCustomer)
    .filter((e): e is NonNullable<typeof e> => e != null);

  return {
    id: request.id,
    caseNumber: request.caseNumber,
    orderNumber: request.orderNumber,
    type: request.type,
    status: request.status,
    reasonLabel: request.reasonLabel,
    message: request.message,
    moreInfoPrompt: request.moreInfoPrompt,
    returnPhysicalStatus: request.returnPhysicalStatus,
    resolutionStatus: request.resolutionStatus,
    refundTotalInPaise: request.refundTotalInPaise,
    refundInitiatedAt: request.refundInitiatedAt,
    refundCompletedAt: request.refundCompletedAt,
    createdAt: request.createdAt,
    items: request.items,
    returnShipment: request.returnShipment,
    replacements: request.replacementFulfillments,
    timeline
  };
}

export async function markMissingPartShipped(opts: {
  orderId: string;
  requestId: string;
  accessoryDescription: string;
  courier?: string;
  awb?: string;
  adminEmail: string;
  adminUserId?: string;
}): Promise<void> {
  const request = await prisma.orderServiceRequest.findFirst({
    where: { id: opts.requestId, orderId: opts.orderId }
  });
  if (!request) {
    throw Object.assign(new Error("Return case not found"), { statusCode: 404, code: "NOT_FOUND" });
  }

  const desc = opts.accessoryDescription.trim();
  if (!desc) {
    throw Object.assign(new Error("Describe the missing part being shipped"), {
      statusCode: 400,
      code: "DESCRIPTION_REQUIRED"
    });
  }

  await prisma.orderServiceRequest.update({
    where: { id: request.id },
    data: {
      finalResolution: "MISSING_PART",
      resolutionStatus: "MISSING_PART_SHIPPED",
      returnPayload: {
        ...((request.returnPayload as Record<string, unknown> | null) ?? {}),
        missingPartShipment: {
          description: desc,
          courier: opts.courier ?? null,
          awb: opts.awb ?? null,
          shippedAt: new Date().toISOString(),
          shippedBy: opts.adminEmail
        }
      }
    }
  });

  await appendCaseEvent({
    requestId: request.id,
    eventType: "MISSING_PART_SHIPPED",
    message: desc,
    payloadJson: { courier: opts.courier ?? null, awb: opts.awb ?? null },
    actor: { email: opts.adminEmail, userId: opts.adminUserId, role: "ADMIN" }
  });
}
