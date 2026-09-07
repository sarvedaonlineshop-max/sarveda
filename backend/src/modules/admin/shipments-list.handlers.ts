import type { NextFunction, Request, Response } from "express";
import type { Prisma, ShipmentStatus } from "@prisma/client";

import { prisma } from "../../config/db";
import { liveAdminOrderWhere } from "./live-order-filter";

type ShipmentBucket =
  | "all"
  | "ready"
  | "created"
  | "picked"
  | "intransit"
  | "ofd"
  | "delivered"
  | "rto";

const SHIPMENT_BUCKETS: ShipmentBucket[] = [
  "all",
  "ready",
  "created",
  "picked",
  "intransit",
  "ofd",
  "delivered",
  "rto"
];

const READY_ORDER_STATUSES = ["PAID", "PROCESSING", "PACKED", "SHIPPED"] as const;

const BUCKET_TO_STATUS: Partial<Record<ShipmentBucket, ShipmentStatus>> = {
  created: "CREATED",
  picked: "PICKED",
  intransit: "INTRANSIT",
  ofd: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  rto: "RTO"
};

function startOfDayKolkata(d: Date): Date {
  const key = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${key}T00:00:00+05:30`);
}

function addDaysInstant(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseYmdToKolkataStart(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

type ListFilters = {
  now: Date;
  bucket: ShipmentBucket;
  orderNumber: string;
  customerName: string;
  place: string;
  country: string;
  awb: string;
  from: Date | null;
  toExclusive: Date | null;
};

function parseFilters(req: Request): ListFilters {
  const now = new Date();
  const rawBucket = String(req.query.bucket ?? "all");
  const bucket: ShipmentBucket = SHIPMENT_BUCKETS.includes(rawBucket as ShipmentBucket)
    ? (rawBucket as ShipmentBucket)
    : "all";

  const todayFlag =
    String(req.query.today ?? "").trim() === "1" ||
    String(req.query.today ?? "").toLowerCase() === "true";

  let from: Date | null = null;
  let toExclusive: Date | null = null;
  if (todayFlag) {
    from = startOfDayKolkata(now);
    toExclusive = addDaysInstant(from, 1);
  } else {
    const fromRaw = String(req.query.from ?? "").trim();
    const toRaw = String(req.query.to ?? "").trim();
    if (fromRaw) from = parseYmdToKolkataStart(fromRaw);
    if (toRaw) {
      const toStart = parseYmdToKolkataStart(toRaw);
      if (toStart) toExclusive = addDaysInstant(toStart, 1);
    }
  }

  return {
    now,
    bucket,
    orderNumber: String(req.query.orderNumber ?? "").trim(),
    customerName: String(req.query.customerName ?? "").trim(),
    place: String(req.query.place ?? "").trim(),
    country: String(req.query.country ?? "").trim(),
    awb: String(req.query.awb ?? "").trim(),
    from,
    toExclusive
  };
}

function orderSearchParts(f: ListFilters): Prisma.OrderWhereInput[] {
  const parts: Prisma.OrderWhereInput[] = [liveAdminOrderWhere(f.now)];

  if (f.orderNumber) {
    parts.push({ orderNumber: { contains: f.orderNumber, mode: "insensitive" } });
  }
  if (f.customerName) {
    parts.push({
      OR: [
        { email: { contains: f.customerName, mode: "insensitive" } },
        { phone: { contains: f.customerName } },
        { customer: { name: { contains: f.customerName, mode: "insensitive" } } },
        {
          addresses: {
            some: { fullName: { contains: f.customerName, mode: "insensitive" } }
          }
        }
      ]
    });
  }
  if (f.place) {
    parts.push({
      addresses: {
        some: {
          OR: [
            { city: { contains: f.place, mode: "insensitive" } },
            { state: { contains: f.place, mode: "insensitive" } },
            { postalCode: { contains: f.place, mode: "insensitive" } }
          ]
        }
      }
    });
  }
  if (f.country) {
    parts.push({
      addresses: {
        some: { country: { contains: f.country, mode: "insensitive" } }
      }
    });
  }
  return parts;
}

/** Paid warehouse orders with no Shipment row yet (Create Shipment pending). */
function readyOrderWhere(f: ListFilters): Prisma.OrderWhereInput {
  const parts = orderSearchParts(f);
  parts.push({ status: { in: [...READY_ORDER_STATUSES] } });
  parts.push({ shipments: { none: {} } });
  if (f.from || f.toExclusive) {
    parts.push({
      createdAt: {
        ...(f.from ? { gte: f.from } : {}),
        ...(f.toExclusive ? { lt: f.toExclusive } : {})
      }
    });
  }
  return { AND: parts };
}

function shipmentWhere(f: ListFilters, status?: ShipmentStatus): Prisma.ShipmentWhereInput {
  const orderAnd = orderSearchParts(f);
  const parts: Prisma.ShipmentWhereInput[] = [
    {
      order: {
        AND: orderAnd
      }
    }
  ];
  if (status) {
    parts.push({ status });
  }
  if (f.awb) {
    parts.push({ awb: { contains: f.awb, mode: "insensitive" } });
  }
  if (f.from || f.toExclusive) {
    parts.push({
      createdAt: {
        ...(f.from ? { gte: f.from } : {}),
        ...(f.toExclusive ? { lt: f.toExclusive } : {})
      }
    });
  }
  return { AND: parts };
}

function mapReadyRow(o: {
  id: string;
  orderNumber: string;
  email: string;
  status: string;
  currency: string;
  grandTotalInPaise: number;
  createdAt: Date;
  customer: { name: string | null } | null;
  addresses: Array<{ city: string; state: string; country: string }>;
  items: Array<{ qtyOrdered: number; nameSnapshot: string }>;
}) {
  return {
    kind: "ready" as const,
    id: `ready:${o.id}`,
    shipmentId: null,
    orderId: o.id,
    orderNumber: o.orderNumber,
    email: o.email,
    customerName: o.customer?.name ?? null,
    city: o.addresses[0]?.city ?? null,
    state: o.addresses[0]?.state ?? null,
    country: o.addresses[0]?.country ?? null,
    courier: null,
    awb: null,
    trackingUrl: null,
    shipmentStatus: null,
    orderStatus: o.status,
    currency: o.currency,
    grandTotalInPaise: o.grandTotalInPaise,
    itemCount: o.items.reduce((s, i) => s + i.qtyOrdered, 0),
    linePreview: o.items.slice(0, 2).map((i) => i.nameSnapshot),
    createdAt: o.createdAt
  };
}

function mapShipmentRow(s: {
  id: string;
  courier: string;
  awb: string | null;
  trackingUrl: string | null;
  status: string;
  createdAt: Date;
  order: {
    id: string;
    orderNumber: string;
    email: string;
    status: string;
    currency: string;
    grandTotalInPaise: number;
    customer: { name: string | null } | null;
    addresses: Array<{ city: string; state: string; country: string }>;
    items: Array<{ qtyOrdered: number; nameSnapshot: string }>;
  };
}) {
  return {
    kind: "shipment" as const,
    id: s.id,
    shipmentId: s.id,
    orderId: s.order.id,
    orderNumber: s.order.orderNumber,
    email: s.order.email,
    customerName: s.order.customer?.name ?? null,
    city: s.order.addresses[0]?.city ?? null,
    state: s.order.addresses[0]?.state ?? null,
    country: s.order.addresses[0]?.country ?? null,
    courier: s.courier,
    awb: s.awb,
    trackingUrl: s.trackingUrl,
    shipmentStatus: s.status,
    orderStatus: s.order.status,
    currency: s.order.currency,
    grandTotalInPaise: s.order.grandTotalInPaise,
    itemCount: s.order.items.reduce((sum, i) => sum + i.qtyOrdered, 0),
    linePreview: s.order.items.slice(0, 2).map((i) => i.nameSnapshot),
    createdAt: s.createdAt
  };
}

const orderInclude = {
  customer: { select: { name: true } },
  addresses: {
    where: { type: "SHIPPING" as const },
    take: 1,
    select: { city: true, state: true, country: true }
  },
  items: { select: { qtyOrdered: true, nameSnapshot: true } }
} satisfies Prisma.OrderInclude;

/**
 * Admin Shipments desk: ready-to-ship orders + carrier shipment rows by status.
 */
export async function shipmentsList(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const f = parseFilters(req);

    const readyWhere = readyOrderWhere(f);
    const allShipmentsWhere = shipmentWhere(f);
    const statusBuckets = ["created", "picked", "intransit", "ofd", "delivered", "rto"] as const;

    // AWB search cannot match ready-to-ship orders (no shipment yet).
    const readyCountWhere = f.awb
      ? ({ AND: [readyWhere, { id: { in: [] } }] } satisfies Prisma.OrderWhereInput)
      : readyWhere;

    const countQueries = [
      prisma.shipment.count({ where: allShipmentsWhere }),
      prisma.order.count({ where: readyCountWhere }),
      ...statusBuckets.map((b) =>
        prisma.shipment.count({
          where: shipmentWhere(f, BUCKET_TO_STATUS[b])
        })
      )
    ];

    if (f.bucket === "ready") {
      if (f.awb) {
        const countParts = await prisma.$transaction(countQueries);
        res.json({
          success: true,
          data: {
            items: [],
            counts: {
              all: countParts[0] as number,
              ready: countParts[1] as number,
              created: countParts[2] as number,
              picked: countParts[3] as number,
              intransit: countParts[4] as number,
              ofd: countParts[5] as number,
              delivered: countParts[6] as number,
              rto: countParts[7] as number
            },
            pagination: { page, limit, total: 0, totalPages: 1 }
          }
        });
        return;
      }

      const [total, rows, ...countParts] = await prisma.$transaction([
        prisma.order.count({ where: readyWhere }),
        prisma.order.findMany({
          where: readyWhere,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: orderInclude
        }),
        ...countQueries
      ]);

      const counts = {
        all: countParts[0] as number,
        ready: countParts[1] as number,
        created: countParts[2] as number,
        picked: countParts[3] as number,
        intransit: countParts[4] as number,
        ofd: countParts[5] as number,
        delivered: countParts[6] as number,
        rto: countParts[7] as number
      };

      res.json({
        success: true,
        data: {
          items: rows.map(mapReadyRow),
          counts,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1
          }
        }
      });
      return;
    }

    const statusFilter =
      f.bucket === "all" ? undefined : BUCKET_TO_STATUS[f.bucket];
    const listWhere = shipmentWhere(f, statusFilter);

    const [total, rows, ...countParts] = await prisma.$transaction([
      prisma.shipment.count({ where: listWhere }),
      prisma.shipment.findMany({
        where: listWhere,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          order: { include: orderInclude }
        }
      }),
      ...countQueries
    ]);

    const counts = {
      all: countParts[0] as number,
      ready: countParts[1] as number,
      created: countParts[2] as number,
      picked: countParts[3] as number,
      intransit: countParts[4] as number,
      ofd: countParts[5] as number,
      delivered: countParts[6] as number,
      rto: countParts[7] as number
    };

    res.json({
      success: true,
      data: {
        items: rows.map(mapShipmentRow),
        counts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1
        }
      }
    });
  } catch (err) {
    next(err);
  }
}
