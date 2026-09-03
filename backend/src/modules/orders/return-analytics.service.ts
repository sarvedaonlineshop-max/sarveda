/**
 * Return management analytics — deterministic queries from authoritative data.
 * Every metric documents numerator / denominator / case-state / date dimension.
 * Missing denominators → DATA_NOT_AVAILABLE (never invented).
 */
import { prisma } from "../../config/db";
import { getReturnPolicyNumber } from "./return-policy-config.service";
import { computeNetSarvedaLossPaise } from "./return-economics.service";

export type MetricDoc = {
  key: string;
  numerator: string;
  denominator: string;
  caseState: string;
  dateDimension: string;
  value: number | null;
  status: "OK" | "DATA_NOT_AVAILABLE";
  note?: string;
};

export async function buildReturnAnalyticsSummary(opts?: {
  lookbackDays?: number;
}) {
  const lookback =
    opts?.lookbackDays ?? (await getReturnPolicyNumber("alert_lookback_days", 90));
  const since = new Date(Date.now() - lookback * 24 * 60 * 60 * 1000);

  const requestsRaised = await prisma.orderServiceRequest.count({
    where: { type: "REFUND_AFTER_DELIVERY", createdAt: { gte: since } }
  });
  const approved = await prisma.orderServiceRequest.count({
    where: {
      type: "REFUND_AFTER_DELIVERY",
      status: "APPROVED",
      reviewedAt: { gte: since }
    }
  });
  const refunded = await prisma.orderServiceRequest.count({
    where: {
      type: "REFUND_AFTER_DELIVERY",
      refundCompletedAt: { gte: since }
    }
  });
  const warehouseReceived = await prisma.orderServiceRequest.count({
    where: {
      type: "REFUND_AFTER_DELIVERY",
      returnPhysicalStatus: { in: ["RECEIVED", "INSPECTED"] },
      updatedAt: { gte: since }
    }
  });

  const soldUnitsAgg = await prisma.orderItem.aggregate({
    where: {
      order: {
        placedAt: { gte: since },
        status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] },
        deletedAt: null
      }
    },
    _sum: { qtyOrdered: true }
  });
  const soldUnits = soldUnitsAgg._sum.qtyOrdered ?? 0;

  const returnedUnitsAgg = await prisma.orderServiceRequestItem.aggregate({
    where: {
      request: {
        type: "REFUND_AFTER_DELIVERY",
        status: { in: ["APPROVED"] },
        createdAt: { gte: since }
      }
    },
    _sum: { qtySelected: true }
  });
  const returnedUnits = returnedUnitsAgg._sum.qtySelected ?? 0;

  const returnRate: MetricDoc = {
    key: "return_rate_pct",
    numerator: "qtySelected on APPROVED REFUND_AFTER_DELIVERY items in window",
    denominator: "qtyOrdered on placed non-cancelled orders in window",
    caseState: "APPROVED",
    dateDimension: `createdAt/placedAt >= now-${lookback}d`,
    value: soldUnits > 0 ? Math.round((returnedUnits / soldUnits) * 10000) / 100 : null,
    status: soldUnits > 0 ? "OK" : "DATA_NOT_AVAILABLE",
    note: soldUnits > 0 ? undefined : "No sold-unit denominator in window"
  };

  const reasonDist = await prisma.orderServiceRequestItem.groupBy({
    by: ["reasonCode"],
    where: {
      request: { type: "REFUND_AFTER_DELIVERY", createdAt: { gte: since } }
    },
    _count: { _all: true },
    orderBy: { _count: { reasonCode: "desc" } },
    take: 20
  });

  const rootCauseDist = await prisma.orderServiceRequest.groupBy({
    by: ["rootCause"],
    where: { type: "REFUND_AFTER_DELIVERY", createdAt: { gte: since } },
    _count: { _all: true }
  });

  const dispositionDist = await prisma.orderReturnQcLine.groupBy({
    by: ["disposition"],
    where: { createdAt: { gte: since } },
    _sum: { quantity: true },
    _count: { _all: true }
  });

  const refundSum = await prisma.orderServiceRequest.aggregate({
    where: { type: "REFUND_AFTER_DELIVERY", refundCompletedAt: { gte: since } },
    _sum: { refundTotalInPaise: true }
  });

  const economicsRows = await prisma.returnCaseEconomics.findMany({
    where: { updatedAt: { gte: since } }
  });
  let totalNetLoss = 0;
  let economicsWithData = 0;
  for (const e of economicsRows) {
    const net = computeNetSarvedaLossPaise(e);
    if (
      (e.merchandiseRefundPaise ?? 0) > 0 ||
      (e.inventoryWriteOffCostPaise ?? 0) > 0 ||
      (e.actualForwardCourierCostPaise ?? 0) > 0
    ) {
      totalNetLoss += net.netLossPaise;
      economicsWithData += 1;
    }
  }

  const courierClaims = await prisma.returnCourierClaim.aggregate({
    where: { openedAt: { gte: since } },
    _sum: { claimedAmountPaise: true, recoveredAmountPaise: true },
    _count: { _all: true }
  });
  const vendorClaims = await prisma.returnVendorClaim.aggregate({
    where: { openedAt: { gte: since } },
    _sum: { claimedAmountPaise: true, recoveredAmountPaise: true },
    _count: { _all: true }
  });

  const inventoryRecovery = {
    sellableQty:
      (
        await prisma.orderInventoryRestockEvent.aggregate({
          where: { disposition: "SELLABLE", createdAt: { gte: since } },
          _sum: { quantity: true }
        })
      )._sum.quantity ?? 0,
    repackPendingQty:
      (
        await prisma.orderReturnQcLine.aggregate({
          where: {
            disposition: "REPACK",
            releasedToSellableAt: null,
            createdAt: { gte: since }
          },
          _sum: { quantity: true }
        })
      )._sum.quantity ?? 0,
    quarantineQty:
      (
        await prisma.orderInventoryRestockEvent.aggregate({
          where: { disposition: "QUARANTINE", createdAt: { gte: since } },
          _sum: { quantity: true }
        })
      )._sum.quantity ?? 0,
    writeOffQty:
      (
        await prisma.orderInventoryRestockEvent.aggregate({
          where: { disposition: { in: ["WRITE_OFF", "DAMAGED"] }, createdAt: { gte: since } },
          _sum: { quantity: true }
        })
      )._sum.quantity ?? 0,
    returnToVendorQty:
      (
        await prisma.orderInventoryRestockEvent.aggregate({
          where: { disposition: "RETURN_TO_VENDOR", createdAt: { gte: since } },
          _sum: { quantity: true }
        })
      )._sum.quantity ?? 0
  };

  const thresholdPct = await getReturnPolicyNumber("alert_sku_return_rate_pct", 15);
  // SKU concentration: top returned SKUs by count (rate vs sold marked DATA_NOT_AVAILABLE per SKU if no sales map)
  const topSkus = await prisma.orderServiceRequestItem.groupBy({
    by: ["skuSnapshot"],
    where: {
      request: { type: "REFUND_AFTER_DELIVERY", status: "APPROVED", createdAt: { gte: since } }
    },
    _sum: { qtySelected: true },
    _count: { _all: true },
    orderBy: { _sum: { qtySelected: "desc" } },
    take: 15
  });

  const flags: Array<{ code: string; message: string; severity: "INFO" | "WARN" }> = [];
  if (returnRate.value != null && returnRate.value >= thresholdPct) {
    flags.push({
      code: "OVERALL_RETURN_RATE_HIGH",
      message: `Overall return rate ${returnRate.value}% exceeds threshold ${thresholdPct}%`,
      severity: "WARN"
    });
  }
  for (const sku of topSkus.slice(0, 5)) {
    if ((sku._sum.qtySelected ?? 0) >= 5) {
      flags.push({
        code: "SKU_RETURN_CONCENTRATION",
        message: `SKU ${sku.skuSnapshot} has ${sku._sum.qtySelected} approved returned units in window`,
        severity: "INFO"
      });
    }
  }

  return {
    lookbackDays: lookback,
    since: since.toISOString(),
    counts: {
      requestsRaised: {
        key: "requests_raised",
        numerator: "REFUND_AFTER_DELIVERY cases created",
        denominator: "n/a (count)",
        caseState: "ANY",
        dateDimension: "createdAt",
        value: requestsRaised,
        status: "OK" as const
      },
      approvedReturns: {
        key: "approved_returns",
        numerator: "cases with status APPROVED",
        denominator: "n/a",
        caseState: "APPROVED",
        dateDimension: "reviewedAt",
        value: approved,
        status: "OK" as const
      },
      warehouseReceived: {
        key: "warehouse_received",
        numerator: "cases with physical RECEIVED/INSPECTED",
        denominator: "n/a",
        caseState: "WAREHOUSE_RECEIVED+",
        dateDimension: "updatedAt",
        value: warehouseReceived,
        status: "OK" as const
      },
      refundedCases: {
        key: "refunded_cases",
        numerator: "cases with refundCompletedAt set",
        denominator: "n/a",
        caseState: "REFUNDED",
        dateDimension: "refundCompletedAt",
        value: refunded,
        status: "OK" as const
      }
    },
    returnRate,
    soldUnits,
    returnedUnits,
    reasonDistribution: reasonDist.map((r) => ({
      reasonCode: r.reasonCode,
      count: r._count._all
    })),
    rootCauseDistribution: rootCauseDist.map((r) => ({
      rootCause: r.rootCause ?? "UNSET",
      count: r._count._all
    })),
    dispositionDistribution: dispositionDist.map((d) => ({
      disposition: d.disposition,
      lines: d._count._all,
      quantity: d._sum.quantity ?? 0
    })),
    refundValuePaise: refundSum._sum.refundTotalInPaise ?? 0,
    netSarvedaLossPaise: economicsWithData > 0 ? totalNetLoss : null,
    netSarvedaLossStatus: economicsWithData > 0 ? "OK" : "DATA_NOT_AVAILABLE",
    netSarvedaLossNote:
      economicsWithData > 0
        ? `Sum of computeNetSarvedaLossPaise across ${economicsWithData} economics rows`
        : "No economics rows with cost/refund components in window",
    courierClaims: {
      count: courierClaims._count._all,
      claimedPaise: courierClaims._sum.claimedAmountPaise ?? 0,
      recoveredPaise: courierClaims._sum.recoveredAmountPaise ?? 0,
      outstandingPaise:
        (courierClaims._sum.claimedAmountPaise ?? 0) -
        (courierClaims._sum.recoveredAmountPaise ?? 0)
    },
    vendorClaims: {
      count: vendorClaims._count._all,
      claimedPaise: vendorClaims._sum.claimedAmountPaise ?? 0,
      recoveredPaise: vendorClaims._sum.recoveredAmountPaise ?? 0,
      outstandingPaise:
        (vendorClaims._sum.claimedAmountPaise ?? 0) -
        (vendorClaims._sum.recoveredAmountPaise ?? 0)
    },
    inventoryRecovery,
    topReturnedSkus: topSkus.map((s) => ({
      sku: s.skuSnapshot,
      returnedQty: s._sum.qtySelected ?? 0,
      caseLines: s._count._all,
      returnRateStatus: "DATA_NOT_AVAILABLE" as const,
      returnRateNote: "Per-SKU sold denominator not joined in this summary — use drill-down"
    })),
    flags
  };
}
