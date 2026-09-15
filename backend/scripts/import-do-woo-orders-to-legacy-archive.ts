/**
 * Import DO Woo shop_orders gap dump into LegacyOrderArchive (+ customer audit).
 *
 * Input JSON from: scripts/dump_do_woo_orders_for_legacy.py
 *
 * Usage (on Lightsail / with DATABASE_URL):
 *   npx tsx scripts/import-do-woo-orders-to-legacy-archive.ts /path/to/do_woo_orders_legacy_gap.json --dry-run
 *   npx tsx scripts/import-do-woo-orders-to-legacy-archive.ts /path/to/do_woo_orders_legacy_gap.json --apply
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { legacyDedupeKeyD2C } from "../src/modules/admin/launch-order-rules";
import {
  mapPaymentProvider,
  mapWooOrderStatus,
  moneyToMinor,
  orderNumberFromWoo
} from "./woo-order-map";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const dryRun = !apply || process.argv.includes("--dry-run");

type DumpLine = {
  name: string;
  sku: string;
  qty: number;
  lineTotal: number;
  lineSubtotal: number;
  productId?: number | null;
  variationId?: number | null;
};

type DumpOrder = {
  wooCommerceId: number;
  postDate: string;
  postStatus: string;
  postModified: string;
  meta: Record<string, string>;
  lineItems: DumpLine[];
};

type DumpUser = {
  wooCommerceId: number;
  email: string;
  displayName: string;
  registered: string;
  billingEmail: string;
  billingPhone: string;
  firstName: string;
  lastName: string;
};

type DumpFile = {
  generatedAt: string;
  sinceId: number;
  sinceDate: string;
  orderCount: number;
  orders: DumpOrder[];
  wpUsers: DumpUser[];
};

function meta(o: DumpOrder, key: string): string {
  return (o.meta[key] ?? "").trim();
}

function fullName(first: string, last: string): string | null {
  const n = `${first} ${last}`.trim();
  return n || null;
}

function parseDate(raw: string): Date {
  // WP MySQL local time strings — treat as IST (+05:30) when no zone.
  const s = raw.trim().replace(" ", "T");
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s);
  const d = new Date(`${s}+05:30`);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(raw);
}

function normEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  if (e.endsWith("@localhost") || e.includes("no-email@import")) return null;
  return e;
}

function addrFromMeta(
  o: DumpOrder,
  prefix: "_billing" | "_shipping"
): Record<string, string | null> | null {
  const line1 = meta(o, `${prefix}_address_1`);
  const city = meta(o, `${prefix}_city`);
  if (!line1 && !city) return null;
  return {
    type: prefix === "_billing" ? "BILLING" : "SHIPPING",
    fullName: fullName(meta(o, `${prefix}_first_name`), meta(o, `${prefix}_last_name`)),
    phone: meta(o, `${prefix}_phone`) || meta(o, "_billing_phone") || null,
    line1: line1 || null,
    line2: meta(o, `${prefix}_address_2`) || null,
    city: city || null,
    state: meta(o, `${prefix}_state`) || null,
    postalCode: meta(o, `${prefix}_postcode`) || null,
    country: meta(o, `${prefix}_country`) || null
  };
}

function buildArchiveRow(o: DumpOrder) {
  const currency = (meta(o, "_order_currency") || "INR").toUpperCase();
  const mapped = mapWooOrderStatus(o.postStatus);
  const orderNumber = orderNumberFromWoo(o.wooCommerceId);
  const email =
    normEmail(meta(o, "_billing_email")) || `woo-${o.wooCommerceId}@import.sarveda.local`;
  const phone = meta(o, "_billing_phone") || meta(o, "_shipping_phone") || null;
  const shipping = addrFromMeta(o, "_shipping");
  const billing = addrFromMeta(o, "_billing");
  const customerName =
    shipping?.fullName ||
    billing?.fullName ||
    fullName(meta(o, "_billing_first_name"), meta(o, "_billing_last_name"));

  const items = o.lineItems.map((li) => {
    const qty = Math.max(1, Math.round(li.qty || 1));
    const lineTotalInPaise = moneyToMinor(String(li.lineTotal || 0), currency);
    const unitPriceInPaise = qty > 0 ? Math.round(lineTotalInPaise / qty) : lineTotalInPaise;
    return {
      sku: li.sku || "",
      name: li.name || "Item",
      qty,
      unitPriceInPaise,
      lineTotalInPaise,
      productId: li.productId ?? null,
      variationId: li.variationId ?? null
    };
  });

  const grandTotalInPaise = moneyToMinor(meta(o, "_order_total") || "0", currency);
  const discountInPaise = moneyToMinor(meta(o, "_cart_discount") || "0", currency);
  const shippingInPaise = moneyToMinor(meta(o, "_order_shipping") || "0", currency);
  const taxInPaise = moneyToMinor(
    String(
      (parseFloat(meta(o, "_order_tax") || "0") || 0) +
        (parseFloat(meta(o, "_order_shipping_tax") || "0") || 0)
    ),
    currency
  );
  const subtotalInPaise = Math.max(
    0,
    grandTotalInPaise - shippingInPaise - taxInPaise + discountInPaise
  );

  const orderDate = parseDate(o.postDate);
  const paymentMethod = meta(o, "_payment_method");

  return {
    dedupeKey: legacyDedupeKeyD2C(orderNumber),
    source: "D2C" as const,
    channelCode: "SARVEDA",
    externalOrderId: String(o.wooCommerceId),
    orderNumber,
    originalOrderId: null as string | null,
    customerName,
    customerEmail: email,
    customerPhone: phone,
    billingAddress: billing,
    shippingAddress: shipping,
    status: mapped.status,
    paymentProvider: paymentMethod ? mapPaymentProvider(paymentMethod) : null,
    paymentStatus: mapped.paymentStatus,
    currency,
    subtotalInPaise,
    discountInPaise,
    shippingInPaise,
    taxInPaise,
    grandTotalInPaise,
    orderDate,
    placedAt: orderDate,
    itemCount: items.reduce((s, i) => s + i.qty, 0),
    linePreview: items.slice(0, 3).map((i) => i.name),
    items,
    payments: paymentMethod
      ? [
          {
            provider: mapPaymentProvider(paymentMethod),
            status: mapped.paymentStatus,
            amountInPaise: grandTotalInPaise,
            currency
          }
        ]
      : null,
    shipments: null,
    wooCommerceId: o.wooCommerceId,
    notes: null as string | null,
    rawSnapshot: {
      source: "do-woo-gap-import",
      postStatus: o.postStatus,
      meta: o.meta,
      attribution: {
        sourceType: meta(o, "_wc_order_attribution_source_type") || null,
        utmSource: meta(o, "_wc_order_attribution_utm_source") || null,
        utmMedium: meta(o, "_wc_order_attribution_utm_medium") || null,
        utmCampaign: meta(o, "_wc_order_attribution_utm_campaign") || null
      }
    }
  };
}

async function importOrders(dump: DumpFile) {
  const ids = dump.orders.map((o) => o.wooCommerceId);
  const existing = await prisma.legacyOrderArchive.findMany({
    where: {
      OR: [
        { wooCommerceId: { in: ids } },
        { dedupeKey: { in: ids.map((id) => legacyDedupeKeyD2C(orderNumberFromWoo(id))) } }
      ]
    },
    select: { wooCommerceId: true, dedupeKey: true, orderNumber: true }
  });
  const existingIds = new Set(
    existing.map((e) => e.wooCommerceId).filter((x): x is number => x != null)
  );
  const existingKeys = new Set(existing.map((e) => e.dedupeKey));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const o of dump.orders) {
    const row = buildArchiveRow(o);
    const already = existingIds.has(o.wooCommerceId) || existingKeys.has(row.dedupeKey);
    if (dryRun) {
      if (already) updated++;
      else created++;
      continue;
    }
    const result = await prisma.legacyOrderArchive.upsert({
      where: { dedupeKey: row.dedupeKey },
      create: row,
      update: {
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        customerPhone: row.customerPhone,
        billingAddress: row.billingAddress ?? undefined,
        shippingAddress: row.shippingAddress ?? undefined,
        status: row.status,
        paymentProvider: row.paymentProvider,
        paymentStatus: row.paymentStatus,
        currency: row.currency,
        subtotalInPaise: row.subtotalInPaise,
        discountInPaise: row.discountInPaise,
        shippingInPaise: row.shippingInPaise,
        taxInPaise: row.taxInPaise,
        grandTotalInPaise: row.grandTotalInPaise,
        orderDate: row.orderDate,
        placedAt: row.placedAt,
        itemCount: row.itemCount,
        linePreview: row.linePreview,
        items: row.items,
        payments: row.payments ?? undefined,
        wooCommerceId: row.wooCommerceId,
        channelCode: row.channelCode,
        externalOrderId: row.externalOrderId,
        rawSnapshot: row.rawSnapshot
      }
    });
    if (already) updated++;
    else created++;
    void result;
  }

  return { created, updated, skipped, total: dump.orders.length, dryRun };
}

async function auditCustomers(dump: DumpFile) {
  const sarvedaUsers = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true, wooCommerceId: true, name: true, createdAt: true }
  });
  const byEmail = new Map<string, (typeof sarvedaUsers)[0]>();
  const byWooId = new Map<number, (typeof sarvedaUsers)[0]>();
  for (const u of sarvedaUsers) {
    byEmail.set(u.email.trim().toLowerCase(), u);
    if (u.wooCommerceId != null) byWooId.set(u.wooCommerceId, u);
  }

  // WP registered users
  let wpMatchedEmail = 0;
  let wpMatchedWooId = 0;
  let wpMissing = 0;
  const wpMissingSamples: Array<{ wooId: number; email: string; name: string }> = [];
  for (const u of dump.wpUsers) {
    const email = normEmail(u.email) || normEmail(u.billingEmail);
    const hitId = byWooId.has(u.wooCommerceId);
    const hitEmail = email ? byEmail.has(email) : false;
    if (hitId) wpMatchedWooId++;
    if (hitEmail) wpMatchedEmail++;
    if (!hitId && !hitEmail) {
      wpMissing++;
      if (wpMissingSamples.length < 15 && email) {
        wpMissingSamples.push({
          wooId: u.wooCommerceId,
          email,
          name: u.displayName || `${u.firstName} ${u.lastName}`.trim()
        });
      }
    }
  }

  // Billing emails on gap orders (includes guests)
  const orderEmails = new Set<string>();
  for (const o of dump.orders) {
    const e = normEmail(meta(o, "_billing_email"));
    if (e) orderEmails.add(e);
  }
  let orderEmailMatched = 0;
  let orderEmailMissing = 0;
  const orderMissingSamples: string[] = [];
  for (const e of orderEmails) {
    if (byEmail.has(e)) orderEmailMatched++;
    else {
      orderEmailMissing++;
      if (orderMissingSamples.length < 20) orderMissingSamples.push(e);
    }
  }

  // All historical DO billing emails from archive D2C + gap dump would be better,
  // but user asked audit of customers — use full wp_users + gap order emails.
  return {
    sarvedaUsers: sarvedaUsers.length,
    sarvedaWithWooId: sarvedaUsers.filter((u) => u.wooCommerceId != null).length,
    wpUsers: dump.wpUsers.length,
    wpMatchedByWooId: wpMatchedWooId,
    wpMatchedByEmail: wpMatchedEmail,
    wpMissingFromSarveda: wpMissing,
    wpMissingSamples,
    gapOrderDistinctBillingEmails: orderEmails.size,
    gapOrderEmailsAlreadyInSarveda: orderEmailMatched,
    gapOrderEmailsMissingFromSarveda: orderEmailMissing,
    gapOrderMissingSamples: orderMissingSamples
  };
}

async function main() {
  const fileArg = process.argv.find((a) => a.endsWith(".json"));
  if (!fileArg) {
    console.error("Usage: npx tsx scripts/import-do-woo-orders-to-legacy-archive.ts <dump.json> [--apply]");
    process.exit(1);
  }
  const dumpPath = path.resolve(fileArg);
  if (!fs.existsSync(dumpPath)) {
    console.error("Missing dump file:", dumpPath);
    process.exit(1);
  }
  const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8")) as DumpFile;
  console.log(
    `Dump ${dump.generatedAt}: ${dump.orderCount} orders, ${dump.wpUsers?.length ?? 0} wp users (sinceId=${dump.sinceId}, sinceDate=${dump.sinceDate})`
  );
  console.log(dryRun ? "Mode: DRY-RUN (pass --apply to write)" : "Mode: APPLY");

  const orderResult = await importOrders(dump);
  console.log("Orders:", orderResult);

  const audit = await auditCustomers(dump);
  console.log("Customer audit:", JSON.stringify(audit, null, 2));

  const reportPath = path.resolve(
    path.dirname(dumpPath),
    `do-woo-legacy-import-report-${new Date().toISOString().slice(0, 10)}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), dryRun, orderResult, audit }, null, 2)
  );
  console.log("Report:", reportPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
