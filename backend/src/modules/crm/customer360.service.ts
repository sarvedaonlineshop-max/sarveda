import { prisma } from "../../config/db";
import { crmNotFound } from "./crm-errors";
import { userSummarySelect } from "./crm.utils";

async function commercialByEmails(emails: string[]) {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!unique.length) {
    return {
      quotations: [] as unknown[],
      orders: [] as unknown[],
      orderCount: 0,
      totalSalesInPaise: 0,
      lastOrder: null as null | {
        id: string;
        orderNumber: string;
        status: string;
        grandTotalInPaise: number;
        placedAt: Date | null;
      },
      productPurchaseHistory: [] as unknown[],
      paidAmountInPaise: null as number | null,
      outstandingAmountInPaise: null as number | null
    };
  }

  const [quotations, orders] = await Promise.all([
    prisma.quotation.findMany({
      where: { email: { in: unique, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        grandTotalInPaise: true,
        currency: true,
        createdAt: true
      }
    }),
    prisma.order.findMany({
      where: {
        deletedAt: null,
        email: { in: unique, mode: "insensitive" }
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        grandTotalInPaise: true,
        currency: true,
        placedAt: true,
        createdAt: true,
        items: {
          select: {
            nameSnapshot: true,
            skuSnapshot: true,
            qtyOrdered: true,
            lineTotalInPaise: true
          },
          take: 20
        },
        payments: {
          select: { amountInPaise: true, status: true },
          take: 10
        }
      }
    })
  ]);

  const counted = orders.filter((o) => !["CANCELLED", "PENDING_PAYMENT"].includes(o.status));
  const totalSalesInPaise = counted.reduce((s, o) => s + o.grandTotalInPaise, 0);
  const paidAmountInPaise = counted.reduce((s, o) => {
    const paid = o.payments
      .filter((p) => p.status === "CAPTURED")
      .reduce((ps, p) => ps + p.amountInPaise, 0);
    return s + paid;
  }, 0);

  const productMap = new Map<
    string,
    { name: string; sku: string | null; qty: number; lineTotalInPaise: number }
  >();
  for (const o of counted) {
    for (const item of o.items) {
      const key = item.skuSnapshot || item.nameSnapshot;
      const prev = productMap.get(key) ?? {
        name: item.nameSnapshot,
        sku: item.skuSnapshot,
        qty: 0,
        lineTotalInPaise: 0
      };
      prev.qty += item.qtyOrdered;
      prev.lineTotalInPaise += item.lineTotalInPaise;
      productMap.set(key, prev);
    }
  }

  const last = counted[0];
  return {
    quotations,
    orders: orders.map(({ items: _i, payments: _p, ...rest }) => rest),
    orderCount: counted.length,
    totalSalesInPaise,
    lastOrder: last
      ? {
          id: last.id,
          orderNumber: last.orderNumber,
          status: last.status,
          grandTotalInPaise: last.grandTotalInPaise,
          placedAt: last.placedAt
        }
      : null,
    productPurchaseHistory: [...productMap.values()].slice(0, 30),
    // Read-only estimate from payment rows — not a CRM ledger.
    paidAmountInPaise,
    outstandingAmountInPaise: Math.max(0, totalSalesInPaise - paidAmountInPaise)
  };
}

export async function getContact360(contactId: string) {
  const contact = await prisma.crmContact.findUnique({
    where: { id: contactId },
    include: {
      owner: { select: userSummarySelect },
      account: true,
      linkedUser: { select: userSummarySelect },
      deals: {
        include: { stage: true, pipeline: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50
      },
      tasks: { orderBy: { dueAt: "asc" }, take: 30 },
      activities: { orderBy: { occurredAt: "desc" }, take: 40 },
      convertedLeads: {
        select: {
          id: true,
          leadNumber: true,
          name: true,
          source: true,
          status: true,
          convertedAt: true
        },
        take: 20
      }
    }
  });
  if (!contact) throw crmNotFound("Contact");

  const emails = [contact.email, contact.account?.email].filter((e): e is string => Boolean(e));
  const commercial = await commercialByEmails(emails);

  const enquiryWhere = {
    OR: [
      ...(contact.email ? [{ customerEmail: { equals: contact.email, mode: "insensitive" as const } }] : []),
      ...(contact.linkedUserId ? [{ userId: contact.linkedUserId }] : [])
    ]
  };

  const [enquiryThreads, complaints] = await Promise.all([
    enquiryWhere.OR.length
      ? prisma.enquiryThread.findMany({
          where: enquiryWhere,
          orderBy: { lastMessageAt: "desc" },
          take: 20,
          select: {
            id: true,
            source: true,
            status: true,
            customerName: true,
            customerEmail: true,
            lastMessageAt: true,
            waPhone: true
          }
        })
      : Promise.resolve([]),
    contact.email
      ? prisma.complaint.findMany({
          where: { raisedByEmail: { equals: contact.email, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
          take: 15,
          select: { id: true, title: true, status: true, createdAt: true }
        })
      : Promise.resolve([])
  ]);

  const openDeals = contact.deals.filter((d) => d.status === "OPEN");
  const wonDeals = contact.deals.filter((d) => d.status === "WON");
  const lostDeals = contact.deals.filter((d) => d.status === "LOST");

  return {
    contact,
    owner: contact.owner,
    account: contact.account,
    openDeals,
    wonDeals,
    lostDeals,
    tasks: contact.tasks,
    activities: contact.activities,
    leads: contact.convertedLeads,
    sales: commercial,
    communication: { enquiryThreads },
    support: { complaints },
    accounting: {
      note: "Read-only estimates from linked orders/payments by email — not a CRM ledger",
      invoicedAmountInPaise: commercial.totalSalesInPaise,
      paidAmountInPaise: commercial.paidAmountInPaise,
      outstandingAmountInPaise: commercial.outstandingAmountInPaise
    }
  };
}

export async function getAccount360(accountId: string) {
  const account = await prisma.crmAccount.findUnique({
    where: { id: accountId },
    include: {
      owner: { select: userSummarySelect },
      contacts: { where: { isActive: true }, take: 50 },
      deals: {
        include: { stage: true, pipeline: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50
      },
      tasks: { orderBy: { dueAt: "asc" }, take: 30 },
      activities: { orderBy: { occurredAt: "desc" }, take: 40 },
      convertedLeads: {
        select: {
          id: true,
          leadNumber: true,
          name: true,
          source: true,
          status: true,
          convertedAt: true
        },
        take: 20
      }
    }
  });
  if (!account) throw crmNotFound("Account");

  const emails = [
    account.email,
    ...account.contacts.map((c) => c.email)
  ].filter((e): e is string => Boolean(e));
  const commercial = await commercialByEmails(emails);

  const openDeals = account.deals.filter((d) => d.status === "OPEN");
  const wonDeals = account.deals.filter((d) => d.status === "WON");
  const lostDeals = account.deals.filter((d) => d.status === "LOST");

  return {
    account,
    owner: account.owner,
    contacts: account.contacts,
    openDeals,
    wonDeals,
    lostDeals,
    tasks: account.tasks,
    activities: account.activities,
    leads: account.convertedLeads,
    sales: commercial,
    accounting: {
      note: "Read-only estimates from linked orders/payments by email — not a CRM ledger",
      invoicedAmountInPaise: commercial.totalSalesInPaise,
      paidAmountInPaise: commercial.paidAmountInPaise,
      outstandingAmountInPaise: commercial.outstandingAmountInPaise
    }
  };
}
