import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { sendMailWithRetry } from "../notifications/email";
import { sendWhatsAppNamedTemplate, toWhatsAppE164 } from "../notifications/whatsapp";

function siteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.FRONTEND_URL?.split(",")[0]?.trim() ||
    "https://sarveda-demo.xyz";
  return raw.replace(/\/$/, "");
}

function backInStockTemplateName(): string {
  return (
    process.env.WHATSAPP_BACK_IN_STOCK_TEMPLATE?.trim() ||
    process.env.EXOTEL_WHATSAPP_BACK_IN_STOCK_TEMPLATE?.trim() ||
    "back_in_stock"
  );
}

export async function subscribeStockNotification(input: {
  productId: string;
  variantId?: string | null;
  email: string;
  phone?: string | null;
  userId?: string | null;
}): Promise<{ created: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    throw Object.assign(new Error("Enter a valid email address."), {
      statusCode: 400,
      code: "INVALID_EMAIL"
    });
  }

  const phoneRaw = input.phone?.trim() || null;
  const phone = phoneRaw
    ? toWhatsAppE164(phoneRaw) ?? (phoneRaw.replace(/\D/g, "") || null)
    : null;
  if (phoneRaw && !toWhatsAppE164(phoneRaw) && !/^\d{10,15}$/.test(phoneRaw.replace(/\D/g, ""))) {
    throw Object.assign(new Error("Enter a valid mobile number for WhatsApp."), {
      statusCode: 400,
      code: "INVALID_PHONE"
    });
  }

  try {
    await prisma.stockNotification.create({
      data: {
        productId: input.productId,
        variantId: input.variantId ?? null,
        email,
        phone,
        userId: input.userId ?? null
      }
    });
    return { created: true };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      // Already subscribed — re-arm for the next restock (and refresh phone if provided).
      await prisma.stockNotification.updateMany({
        where: {
          productId: input.productId,
          email,
          variantId: input.variantId ?? null
        },
        data: {
          notifiedAt: null,
          ...(phone ? { phone } : {})
        }
      });
      return { created: false };
    }
    throw err;
  }
}

async function sendBackInStockWhatsApp(opts: {
  phone: string;
  productName: string;
  productUrl: string;
}): Promise<void> {
  const to = toWhatsAppE164(opts.phone);
  if (!to) {
    throw new Error("Invalid WhatsApp phone");
  }
  const templateName = backInStockTemplateName();
  // Template body expected: {{1}} product name, {{2}} product URL
  await sendWhatsAppNamedTemplate(to, templateName, [
    opts.productName.slice(0, 200),
    opts.productUrl.slice(0, 1024)
  ]);
}

/** Email + WhatsApp subscribers when variant stock becomes available again. */
export async function notifyStockSubscribersForVariant(variantId: string): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      inventory: true,
      productRel: { select: { id: true, name: true, slug: true } }
    }
  });
  if (!variant?.productRel || !variant.inventory) return;

  const available = Math.max(0, variant.inventory.onHand - variant.inventory.reserved);
  if (available < 1) return;

  const pending = await prisma.stockNotification.findMany({
    where: {
      productId: variant.productId,
      OR: [{ variantId }, { variantId: null }],
      notifiedAt: null
    },
    take: 200
  });
  if (!pending.length) return;

  const productUrl = `${siteBaseUrl()}/product/${variant.productRel.slug}`;
  const productName = variant.productRel.name;

  for (const row of pending) {
    let emailOk = false;

    try {
      const { buildShopEmail } = await import("../notifications/email");
      const html = buildShopEmail(
        "",
        [
          `Good news — <strong>${productName}</strong> is available again.`,
          "Visit the product page to place your order while stock lasts."
        ],
        {
          banner: "In stock again",
          greeting: "Dear Customer,",
          intro: "Warm greetings from Sarveda.",
          ctas: [{ href: productUrl, label: "View product" }]
        }
      );
      await sendMailWithRetry(
        row.email,
        `${productName} is back in stock — Sarveda`,
        html,
        `Good news — ${productName} is available again. View: ${productUrl}`
      );
      emailOk = true;
      logger.info("stock_notification_email_sent", {
        id: row.id,
        email: row.email,
        variantId,
        productId: variant.productId
      });
    } catch (err) {
      logger.error("stock_notification_email_failed", { id: row.id, email: row.email, err });
    }

    // Optional WhatsApp — never blocks email success / retry.
    if (row.phone) {
      try {
        await sendBackInStockWhatsApp({
          phone: row.phone,
          productName,
          productUrl
        });
      } catch (err) {
        logger.error("stock_notification_whatsapp_failed", { id: row.id, err });
      }
    }

    // Only mark notified after a successful email so failed SendGrid rows can retry.
    if (emailOk) {
      await prisma.stockNotification.update({
        where: { id: row.id },
        data: { notifiedAt: new Date() }
      });
    }
  }

  logger.info("stock_notification_batch_done", {
    variantId,
    productId: variant.productId,
    pending: pending.length
  });
}

/** Fire-and-forget notify for one or more variants after a restock. */
export function queueNotifyStockSubscribers(variantIds: string[]): void {
  const ids = [...new Set(variantIds.filter(Boolean))];
  for (const id of ids) {
    void notifyStockSubscribersForVariant(id).catch((err) => {
      logger.error("stock_notification_queue_failed", { variantId: id, err });
    });
  }
}
