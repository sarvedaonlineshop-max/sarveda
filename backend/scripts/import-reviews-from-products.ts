/**
 * Import WooCommerce product reviews from embedded <wp:comment> in products WXR.
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "path";

import { assertFile, may30 } from "./migration-paths";
import { streamWxrItems } from "./wxr-stream";
import { cdata, parseIntSafe } from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const reviewerCache = new Map<string, string>();

async function reviewerIdForEmail(email: string, name: string): Promise<string> {
  const key = email.toLowerCase();
  if (reviewerCache.has(key)) return reviewerCache.get(key)!;

  const existing = await prisma.user.findUnique({ where: { email: key } });
  if (existing) {
    reviewerCache.set(key, existing.id);
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      email: key,
      name: name || "Customer",
      role: "CUSTOMER",
      isVerified: false
    }
  });
  reviewerCache.set(key, created.id);
  return created.id;
}

function parseCommentMeta(commentBlock: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const re =
    /<wp:meta_key><!\[CDATA\[([^\]]+)\]\]><\/wp:meta_key>\s*<wp:meta_value><!\[CDATA\[([\s\S]*?)\]\]><\/wp:meta_value>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(commentBlock))) {
    meta[m[1]] = m[2];
  }
  return meta;
}

function parseReviews(block: string, productWooId: number) {
  if (!block.includes("<wp:post_type><![CDATA[product]]></wp:post_type>")) return [];

  const reviews: Array<{
    rating: number;
    title: string | null;
    body: string | null;
    email: string;
    name: string;
    createdAt: Date;
  }> = [];

  const commentRe =
    /<wp:comment>([\s\S]*?)<\/wp:comment>/g;
  let m: RegExpExecArray | null;
  while ((m = commentRe.exec(block))) {
    const c = m[1];
    if (!c.includes("<wp:comment_type><![CDATA[review]]></wp:comment_type>")) continue;
    if (!c.includes("<wp:comment_approved><![CDATA[1]]></wp:comment_approved>")) continue;

    const cmeta = parseCommentMeta(c);
    const rating = parseInt(cmeta.rating ?? "5", 10) || 5;
    const body = cdata("wp:comment_content", c);
    const name = cdata("wp:comment_author", c) || "Customer";
    const emailRaw = cdata("wp:comment_author_email", c);
    const email =
      emailRaw && emailRaw.includes("@") ?
        emailRaw.toLowerCase()
      : `review-${productWooId}-${reviews.length}@import.sarveda.local`;
    const dateStr = cdata("wp:comment_date", c);
    const createdAt = dateStr ? new Date(dateStr) : new Date();

    reviews.push({
      rating: Math.min(5, Math.max(1, rating || 5)),
      title: null,
      body: body || null,
      email,
      name,
      createdAt
    });
  }

  return reviews;
}

async function main() {
  const xmlPath = may30.products();
  assertFile(xmlPath, "products WXR");

  let products = 0;
  let reviews = 0;
  let skipped = 0;

  for await (const block of streamWxrItems(xmlPath)) {
    const productWooId = parseIntSafe(cdata("wp:post_id", block));
    if (!productWooId) continue;
    if (!block.includes("<wp:post_type><![CDATA[product]]></wp:post_type>")) continue;

    const product = await prisma.product.findUnique({
      where: { wooCommerceId: productWooId },
      select: { id: true }
    });
    if (!product) {
      skipped++;
      continue;
    }

    products++;
    const parsed = parseReviews(block, productWooId);

    for (const r of parsed) {
      if (dryRun) {
        reviews++;
        continue;
      }

      const userId = await reviewerIdForEmail(r.email, r.name);
      const dup = await prisma.review.findFirst({
        where: {
          productId: product.id,
          userId,
          body: r.body ?? undefined
        }
      });
      if (dup) continue;

      await prisma.review.create({
        data: {
          productId: product.id,
          userId,
          rating: r.rating,
          title: r.title,
          body: r.body,
          isVerified: true,
          isApproved: true,
          createdAt: r.createdAt
        }
      });
      reviews++;
    }
  }

  console.log(
    `Reviews: ${products} products scanned, ${reviews} reviews imported, ${skipped} products missing in DB${dryRun ? " (dry)" : ""}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
