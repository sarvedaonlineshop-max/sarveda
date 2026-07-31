import { prisma } from "../../config/db";
import { logger } from "../../config/logger";
import { sendMail } from "../notifications/email";

export async function subscribeStockNotification(input: {
  productId: string;
  variantId?: string | null;
  email: string;
  userId?: string | null;
}): Promise<{ created: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    throw Object.assign(new Error("Enter a valid email address."), {
      statusCode: 400,
      code: "INVALID_EMAIL"
    });
  }

  try {
    await prisma.stockNotification.create({
      data: {
        productId: input.productId,
        variantId: input.variantId ?? null,
        email,
        userId: input.userId ?? null
      }
    });
    return { created: true };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return { created: false };
    }
    throw err;
  }
}

/** Email subscribers when variant stock becomes available again. */
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

  const productUrl = `${(process.env.FRONTEND_URL ?? "https://sarveda-demo.xyz").split(",")[0]?.trim()}/product/${variant.productRel.slug}`;

  for (const row of pending) {
    try {
      const { buildShopEmail } = await import("../notifications/email");
      const html = buildShopEmail(
        "",
        [
          `Good news — <strong>${variant.productRel.name}</strong> is available again.`,
          "Visit the product page to place your order while stock lasts."
        ],
        {
          banner: "In stock again",
          greeting: "Dear Customer,",
          intro: "Warm greetings from Sarveda.",
          ctas: [{ href: productUrl, label: "View product" }]
        }
      );
      await sendMail(
        row.email,
        `${variant.productRel.name} is back in stock — Sarveda`,
        html,
        `Good news — ${variant.productRel.name} is available again. View: ${productUrl}`
      );
      await prisma.stockNotification.update({
        where: { id: row.id },
        data: { notifiedAt: new Date() }
      });
    } catch (err) {
      logger.error("stock_notification_email_failed", { id: row.id, err });
    }
  }
}
