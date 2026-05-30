/**
 * Import WooCommerce shop_order records from May-30 WXR.
 * Note: this export does NOT include line items — stored in wooLegacyMeta on Order.
 *
 * Usage: npx tsx scripts/import-orders-wxr.ts [--dry-run] [--limit=100]
 */
import { AddressType, PaymentStatus, Prisma, PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

import { assertFile, may30 } from "./migration-paths";
import {
  mapPaymentProvider,
  mapWooOrderStatus,
  moneyToMinor,
  orderNumberFromWoo
} from "./woo-order-map";
import { streamWxrItems } from "./wxr-stream";
import { cdata, parseIntSafe, parseMeta } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : 0;

async function loadUserMap(): Promise<Map<number, string>> {
  const users = await prisma.user.findMany({
    where: { wooCommerceId: { not: null } },
    select: { id: true, wooCommerceId: true }
  });
  const map = new Map<number, string>();
  for (const u of users) {
    if (u.wooCommerceId != null) map.set(u.wooCommerceId, u.id);
  }
  return map;
}

function parseOrderBlock(block: string) {
  if (!block.includes("<wp:post_type><![CDATA[shop_order]]></wp:post_type>")) return null;

  const wpPostId = parseIntSafe(cdata("wp:post_id", block));
  if (!wpPostId) return null;

  const meta = parseMeta(block);
  const wpStatus = cdata("wp:status", block);
  const mapped = mapWooOrderStatus(wpStatus);
  const currency = (meta._order_currency ?? "INR").toUpperCase();
  const grandTotal = moneyToMinor(meta._order_total ?? "0", currency);
  const shipping = moneyToMinor(meta._order_shipping ?? "0", currency);
  const tax = moneyToMinor(meta._order_tax ?? "0", currency);
  const discount = moneyToMinor(meta._cart_discount ?? "0", currency);
  const subtotal = Math.max(0, grandTotal - shipping - tax + discount);

  const email = (meta._billing_email ?? "").trim().toLowerCase();
  const phone = (meta._billing_phone ?? meta._shipping_phone ?? "0000000000").trim() || "0000000000";
  const customerWooId = parseIntSafe(meta._customer_user);

  const paidAt =
    meta._paid_date?.trim() ?
      new Date(meta._paid_date)
    : meta._date_paid ?
      new Date(parseIntSafe(meta._date_paid) * 1000)
    : null;

  const placedAt = new Date(cdata("wp:post_date", block) || Date.now());

  const billingName = [meta._billing_first_name, meta._billing_last_name].filter(Boolean).join(" ").trim() || "Customer";

  const legacyMeta: Prisma.InputJsonValue = {
    importedFrom: "woocommerce-wxr",
    wpStatus,
    paymentMethod: meta._payment_method,
    paymentMethodTitle: meta._payment_method_title,
    transactionId: meta._transaction_id,
    stripeIntentId: meta._stripe_intent_id,
    razorpayPaymentId: meta._razorpay_payment_id,
    lineItemsNote:
      "Woo Tools export does not include order line items. Export WooCommerce → Orders CSV for line-level detail if needed."
  };

  return {
    wpPostId,
    orderNumber: orderNumberFromWoo(wpPostId),
    email: email || "no-email@import.sarveda.local",
    phone,
    customerWooId,
    currency,
    subtotalInPaise: subtotal,
    discountInPaise: discount,
    shippingInPaise: shipping,
    taxInPaise: tax,
    grandTotalInPaise: grandTotal,
    couponCode: meta._coupon_codes || meta.coupon_code || null,
    notes: meta._customer_note || null,
    placedAt: paidAt ?? placedAt,
    createdAt: placedAt,
    ...mapped,
    provider: mapPaymentProvider(meta._payment_method ?? ""),
    providerPaymentId:
      meta._transaction_id || meta._stripe_intent_id || meta._razorpay_payment_id || null,
    billing: {
      fullName: billingName,
      phone,
      line1: meta._billing_address_1 || "—",
      line2: meta._billing_address_2 || null,
      city: meta._billing_city || "—",
      state: meta._billing_state || "—",
      postalCode: meta._billing_postcode || "000000",
      country: (meta._billing_country || "IN").slice(0, 2).toUpperCase()
    },
    shipping:
      meta._shipping_address_1?.trim() ?
        {
          fullName:
            [meta._shipping_first_name, meta._shipping_last_name].filter(Boolean).join(" ").trim() ||
            billingName,
          phone: meta._shipping_phone?.trim() || phone,
          line1: meta._shipping_address_1,
          line2: meta._shipping_address_2 || null,
          city: meta._shipping_city || "—",
          state: meta._shipping_state || "—",
          postalCode: meta._shipping_postcode || "000000",
          country: (meta._shipping_country || meta._billing_country || "IN").slice(0, 2).toUpperCase()
        }
      : null,
    wooLegacyMeta: legacyMeta
  };
}

async function main() {
  const xmlPath = may30.orders();
  assertFile(xmlPath, "orders WXR");

  const userMap = dryRun ? new Map<number, string>() : await loadUserMap();
  let processed = 0;
  let imported = 0;
  let skipped = 0;

  const batch: ReturnType<typeof parseOrderBlock>[] = [];

  async function flushBatch() {
    if (!batch.length) return;
    const slice = batch.splice(0, batch.length);

    if (dryRun) {
      imported += slice.length;
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const o of slice) {
        if (!o) continue;
        const customerId =
          o.customerWooId > 0 ? (userMap.get(o.customerWooId) ?? null) : null;

        const order = await tx.order.upsert({
          where: { wooCommerceId: o.wpPostId },
          create: {
            wooCommerceId: o.wpPostId,
            orderNumber: o.orderNumber,
            customerId,
            email: o.email,
            phone: o.phone,
            status: o.status,
            paymentStatus: o.paymentStatus,
            fulfillmentStatus: o.fulfillmentStatus,
            currency: o.currency,
            subtotalInPaise: o.subtotalInPaise,
            discountInPaise: o.discountInPaise,
            shippingInPaise: o.shippingInPaise,
            taxInPaise: o.taxInPaise,
            grandTotalInPaise: o.grandTotalInPaise,
            couponCode: o.couponCode,
            notes: o.notes,
            placedAt: o.placedAt,
            createdAt: o.createdAt,
            wooLegacyMeta: o.wooLegacyMeta,
            addresses: {
              create: [
                { type: AddressType.BILLING, ...o.billing },
                ...(o.shipping ? [{ type: AddressType.SHIPPING, ...o.shipping }] : [])
              ]
            },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: o.status,
                reason: "Imported from WooCommerce"
              }
            }
          },
          update: {
            customerId,
            email: o.email,
            phone: o.phone,
            status: o.status,
            paymentStatus: o.paymentStatus,
            fulfillmentStatus: o.fulfillmentStatus,
            grandTotalInPaise: o.grandTotalInPaise,
            wooLegacyMeta: o.wooLegacyMeta
          }
        });

        if (
          o.paymentStatus === PaymentStatus.CAPTURED ||
          o.paymentStatus === PaymentStatus.AUTHORIZED
        ) {
          const existingPay = await tx.payment.findFirst({ where: { orderId: order.id } });
          if (!existingPay) {
            await tx.payment.create({
              data: {
                orderId: order.id,
                provider: o.provider,
                providerPaymentId: o.providerPaymentId,
                amountInPaise: o.grandTotalInPaise,
                currency: o.currency,
                status: o.paymentStatus
              }
            });
          }
        }
      }
    });

    imported += slice.length;
  }

  for await (const block of streamWxrItems(xmlPath)) {
    processed++;
    if (limit > 0 && processed > limit) break;

    const parsed = parseOrderBlock(block);
    if (!parsed) {
      skipped++;
      continue;
    }

    batch.push(parsed);
    if (batch.length >= 40) await flushBatch();
  }

  await flushBatch();

  console.log(
    `Orders WXR: scanned ${processed}, imported ${imported}, skipped ${skipped}${dryRun ? " (dry)" : ""}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
