/**
 * One-off: migrate Sound Therapy Practitioner Foundations from WP (sarveda.store)
 * into Lightsail Course + DigitalCheckoutOffer for Razorpay enroll.
 *
 * Usage: npx tsx scripts/seed-sound-therapy-practitioner-foundations.ts [--dry-run]
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, CourseEnrollmentMode, CourseStatus } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ensureDigitalCheckoutOffer } from "../src/utils/digital-checkout-offer";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const dryRun = process.argv.includes("--dry-run");
const payloadPath =
  process.argv.find((a) => a.endsWith(".json") && !a.includes("tsconfig")) ??
  path.resolve(__dirname, "../../data/courses/sound-therapy-practitioner-foundations.json");

async function uploadImage(sourceUrl: string): Promise<string> {
  const key = `media/courses/sound-therapy-practitioner-foundations/hero-${Date.now()}.png`;
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/png";
  const region = process.env.AWS_S3_REGION || process.env.AWS_REGION || "us-east-1";
  const bucket = process.env.AWS_S3_BUCKET_NAME || "sarveda-media";
  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
  });
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  const cdn = (process.env.AWS_CLOUDFRONT_URL || "").replace(/\/$/, "");
  if (cdn) return `${cdn}/${key}`;
  return `https://${bucket}.s3.amazonaws.com/${key}`;
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(payloadPath, "utf8")) as {
    slug: string;
    title: string;
    shortDescription: string;
    description: string;
    priceInPaise: number;
    priceUsdCents: number;
    isFree: boolean;
    enrollmentMode: CourseEnrollmentMode;
    status: CourseStatus;
    wpPostId: number;
    seoTitle: string;
    seoDescription: string;
    sourceImageUrl: string;
    extra: Record<string, unknown>;
  };

  console.log("Payload:", raw.slug, dryRun ? "(dry-run)" : "");

  let imageUrl: string | null = null;
  if (!dryRun) {
    console.log("Uploading hero image…");
    imageUrl = await uploadImage(raw.sourceImageUrl);
    console.log("imageUrl", imageUrl);
  }

  const prisma = new PrismaClient();
  try {
    if (dryRun) {
      console.log(JSON.stringify({ ...raw, imageUrl: "(would upload)" }, null, 2).slice(0, 1500));
      return;
    }

    const course = await prisma.course.upsert({
      where: { slug: raw.slug },
      create: {
        slug: raw.slug,
        title: raw.title,
        shortDescription: raw.shortDescription,
        description: raw.description,
        priceInPaise: raw.priceInPaise,
        priceUsdCents: raw.priceUsdCents,
        isFree: raw.isFree,
        enrollmentMode: raw.enrollmentMode,
        status: raw.status,
        wpPostId: raw.wpPostId,
        seoTitle: raw.seoTitle,
        seoDescription: raw.seoDescription,
        imageUrl,
        extra: raw.extra as object
      },
      update: {
        title: raw.title,
        shortDescription: raw.shortDescription,
        description: raw.description,
        priceInPaise: raw.priceInPaise,
        priceUsdCents: raw.priceUsdCents,
        isFree: raw.isFree,
        enrollmentMode: raw.enrollmentMode,
        status: raw.status,
        wpPostId: raw.wpPostId,
        seoTitle: raw.seoTitle,
        seoDescription: raw.seoDescription,
        imageUrl: imageUrl ?? undefined,
        extra: raw.extra as object
      }
    });

    const offer = await ensureDigitalCheckoutOffer(prisma, {
      kind: "COURSE",
      entitySlug: course.slug,
      courseId: course.id,
      title: course.title,
      priceInPaise: course.priceInPaise,
      priceUsdCents: course.priceUsdCents,
      imageUrl: course.imageUrl,
      skuPrefix: "COURSE",
      materializeVariant: false
    });

    console.log("Course id:", course.id);
    console.log("Offer:", offer.sku, offer.offerId);
    console.log("URL: /course/" + course.slug);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
