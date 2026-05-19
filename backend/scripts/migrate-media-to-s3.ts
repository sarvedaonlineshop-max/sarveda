/**
 * Mirror WordPress / theme media URLs to S3 and update Postgres.
 *
 * Usage:
 *   npx tsx scripts/migrate-media-to-s3.ts --dry-run
 *   npx tsx scripts/migrate-media-to-s3.ts --products
 *   npx tsx scripts/migrate-media-to-s3.ts --content
 *   npx tsx scripts/migrate-media-to-s3.ts --corporate
 *   npx tsx scripts/migrate-media-to-s3.ts   # all
 *
 * Requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME on EC2.
 * Set AWS_CLOUDFRONT_URL and NEXT_PUBLIC_MEDIA_CDN_URL to the same CDN base after run.
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

import {
  assertS3RegionMatchesBucket,
  bucketName as getBucket,
  getPublicMediaUrl,
  mirrorUrlToS3,
  resolveBucketRegion,
  s3Region
} from "../src/config/s3";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const onlyProducts = process.argv.includes("--products");
const onlyContent = process.argv.includes("--content");
const onlyCorporate = process.argv.includes("--corporate");
const runAll = !onlyProducts && !onlyContent && !onlyCorporate;

const MAP_FILE = path.resolve(__dirname, "../../data/media-migration-map.json");

type MapEntry = { from: string; to: string; key: string; ok: boolean; error?: string };

const urlMap = new Map<string, string>();

function loadMap(): void {
  if (!fs.existsSync(MAP_FILE)) return;
  const raw = JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) as MapEntry[];
  for (const row of raw) {
    if (row.ok && row.to) urlMap.set(row.from, row.to);
  }
}

function saveMap(entries: MapEntry[]): void {
  fs.writeFileSync(MAP_FILE, JSON.stringify(entries, null, 2));
}

function keyForWpUpload(url: string): string | null {
  const prefix = "https://sarveda.com/wp-content/uploads/";
  if (!url.startsWith(prefix)) return null;
  return `media/wp/uploads/${url.slice(prefix.length)}`;
}

function keyForTheme(url: string): string | null {
  const prefix = "https://sarveda.com/wp-content/themes/sarveda/assets/img/";
  if (!url.startsWith(prefix)) return null;
  return `media/corporate/${url.slice(prefix.length)}`;
}

function keyForUrl(url: string): string | null {
  return keyForWpUpload(url) ?? keyForTheme(url);
}

async function migrateUrl(sourceUrl: string): Promise<string | null> {
  const trimmed = sourceUrl.trim();
  if (!trimmed.startsWith("http")) return null;

  const cdn = process.env.AWS_CLOUDFRONT_URL?.replace(/\/$/, "");
  if (cdn && trimmed.startsWith(cdn)) return trimmed;

  const cached = urlMap.get(trimmed);
  if (cached) return cached;

  const key = keyForUrl(trimmed);
  if (!key) {
    console.warn("skip (unknown host/path):", trimmed.slice(0, 80));
    return null;
  }

  if (dryRun) {
    console.log(`[dry-run] ${trimmed} → ${key}`);
    return getPublicMediaUrl(key);
  }

  try {
    const uploaded = await mirrorUrlToS3(trimmed, key);
    if (!uploaded) {
      console.warn("S3 not configured — skip upload:", trimmed);
      return null;
    }
    urlMap.set(trimmed, uploaded);
    console.log("✓", key);
    return uploaded;
  } catch (err) {
    console.error("✗", trimmed, err instanceof Error ? err.message : err);
    return null;
  }
}

async function replaceField(
  label: string,
  rows: { id: string; url: string | null }[],
  update: (id: string, url: string) => Promise<void>
): Promise<number> {
  let n = 0;
  for (const row of rows) {
    if (!row.url?.startsWith("http")) continue;
    const next = await migrateUrl(row.url);
    if (!next || next === row.url) continue;
    if (!dryRun) await update(row.id, next);
    n++;
  }
  console.log(`${label}: ${n} updated`);
  return n;
}

async function migrateProducts(): Promise<void> {
  const images = await prisma.productImage.findMany({ select: { id: true, url: true } });
  await replaceField("ProductImage", images, (id, url) =>
    prisma.productImage.update({ where: { id }, data: { url } })
  );

  const audio = await prisma.product.findMany({
    where: { audioUrl: { not: null } },
    select: { id: true, audioUrl: true }
  });
  for (const p of audio) {
    if (!p.audioUrl) continue;
    const next = await migrateUrl(p.audioUrl);
    if (next && next !== p.audioUrl && !dryRun) {
      await prisma.product.update({ where: { id: p.id }, data: { audioUrl: next } });
    }
  }
  console.log("Product audio URLs processed");
}

async function migrateContent(): Promise<void> {
  const courses = await prisma.course.findMany({ select: { id: true, imageUrl: true } });
  for (const row of courses) {
    if (!row.imageUrl) continue;
    const next = await migrateUrl(row.imageUrl);
    if (next && next !== row.imageUrl && !dryRun) {
      await prisma.course.update({ where: { id: row.id }, data: { imageUrl: next } });
    }
  }

  const tables: Array<{
    name: string;
    fetch: () => Promise<{ id: string; imageUrl: string | null }[]>;
    update: (id: string, url: string) => Promise<unknown>;
  }> = [
    {
      name: "Event",
      fetch: () => prisma.event.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => prisma.event.update({ where: { id }, data: { imageUrl } })
    },
    {
      name: "BlogPost",
      fetch: () => prisma.blogPost.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => prisma.blogPost.update({ where: { id }, data: { imageUrl } })
    },
    {
      name: "CmsPage",
      fetch: () => prisma.cmsPage.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => prisma.cmsPage.update({ where: { id }, data: { imageUrl } })
    },
    {
      name: "Retreat",
      fetch: () => prisma.retreat.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => prisma.retreat.update({ where: { id }, data: { imageUrl } })
    },
    {
      name: "Offer",
      fetch: () => prisma.offer.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => prisma.offer.update({ where: { id }, data: { imageUrl } })
    },
    {
      name: "Testimonial",
      fetch: () => prisma.testimonial.findMany({ select: { id: true, imageUrl: true } }),
      update: (id, imageUrl) => prisma.testimonial.update({ where: { id }, data: { imageUrl } })
    }
  ];

  for (const t of tables) {
    const rows = await t.fetch();
    await replaceField(t.name, rows, t.update);
  }

  const people = [
    ...(await prisma.vaidya.findMany({ select: { id: true, photoUrl: true } })).map((r) => ({
      id: r.id,
      url: r.photoUrl
    })),
    ...(await prisma.mentor.findMany({ select: { id: true, photoUrl: true } })).map((r) => ({
      id: r.id,
      url: r.photoUrl
    }))
  ];
  for (const row of people) {
    if (!row.url) continue;
    const next = await migrateUrl(row.url);
    if (!next || next === row.url || dryRun) continue;
    if (await prisma.vaidya.findUnique({ where: { id: row.id } })) {
      await prisma.vaidya.update({ where: { id: row.id }, data: { photoUrl: next } });
    } else {
      await prisma.mentor.update({ where: { id: row.id }, data: { photoUrl: next } });
    }
  }
  console.log("People photos processed");
}

/** Corporate theme assets — URLs from frontend data files (upload only, no DB). */
async function migrateCorporateList(urls: string[]): Promise<void> {
  const unique = [...new Set(urls)];
  console.log(`Corporate assets: ${unique.length} URLs`);
  for (const url of unique) {
    await migrateUrl(url);
  }
}

function collectCorporateUrls(): string[] {
  const themeBase = "https://sarveda.com/wp-content/themes/sarveda/assets/img/";
  const relPaths = [
    "corporate/prayog.jpg",
    "corporate/vibe.png",
    "corporate/fares.jpg",
    "corporate/earth.jpg",
    "corporate/weekly_icon.png",
    "corporate/monthly_icon.png",
    "corporate/customized_icon.png",
    "corporate/retreat_1.jpg",
    "corporate/holistic_approach_to_wellness.jpg",
    "img-001.svg",
    "img-002.svg",
    "img-003.svg",
    "corporate/gallery/masnory-01.jpg",
    "corporate/gallery/masnory-02.jpg",
    "corporate/gallery/masnory-03.jpg",
    "corporate/gallery/masnory-04.jpg",
    "corporate/gallery/masnory-05.jpg",
    "corporate/gallery/masnory-06.jpg",
    "star.svg",
    "mail-icon.svg",
    "phone-icon.svg",
    "testimonial/Vaishali.jpeg",
    "testimonial/Vinod.jpeg",
    "facilitatos/Arjun.jpg",
    "facilitatos/Priya.jpg",
    "facilitatos/Chetan.jpg",
    "facilitatos/tejal_rathod.jpg",
    "facilitatos/Saloni.jpg",
    "facilitatos/Vivek.jpg",
    "facilitatos/Saatvika.jpg",
    "facilitatos/Xenkat.jpg",
    "facilitatos/Riya.jpg",
    "t-logo-8.png",
    "t-logo-9.svg",
    "t-logo-10.webp",
    "Veeam_logo.png",
    "paypal_logo.png",
    "t-logo-12.svg",
    "t-logo-13.jpeg",
    "t-logo-14.png",
    "corporate/prayog/banner.jpg",
    "corporate/prayog/pranayama.jpg",
    "corporate/prayog/aasna.jpg",
    "corporate/prayog/yoga.jpg",
    "corporate/prayog/pranayama_1.jpg",
    "corporate/prayog/aasna_1.jpg",
    "corporate/prayog/yoga_1.jpg",
    "corporate/vibe/banner.jpg",
    "corporate/vibe/soundbath.jpg",
    "corporate/vibe/drumcircle.jpg",
    "corporate/vibe/image2.jpg",
    "corporate/vibe/image1.jpg",
    "corporate/fares/banner.jpg",
    "corporate/fares/focus.jpg",
    "corporate/fares/awareness.jpg",
    "corporate/fares/resilience.jpg",
    "corporate/fares/expression.jpg",
    "corporate/fares/collaboration.jpg",
    "corporate/fares/focus_1.jpg",
    "corporate/fares/awareness_1.jpg",
    "corporate/fares/resilience_1.jpg",
    "corporate/fares/expression_1.jpg",
    "corporate/fares/collaboration_1.jpg",
    "corporate/earth/banner.jpg",
    "corporate/earth/art.jpg",
    "corporate/earth/expression.jpg",
    "corporate/earth/sharing.jpg",
    "corporate/earth/art_1.jpg",
    "corporate/earth/expression_1.jpg",
    "corporate/earth/sharing_1.jpg"
  ];
  return relPaths.map((p) => `${themeBase}${p}`);
}

async function main(): Promise<void> {
  const bucket = getBucket();
  if (!bucket) {
    console.error("Set AWS_S3_BUCKET_NAME in backend/.env");
    process.exit(1);
  }

  const actualRegion = await resolveBucketRegion(bucket);
  console.log(`S3 bucket ${bucket} is in ${actualRegion}; configured ${s3Region()}`);
  assertS3RegionMatchesBucket(actualRegion);

  loadMap();
  console.log(dryRun ? "DRY RUN" : "LIVE migration to S3");

  if (runAll || onlyProducts) await migrateProducts();
  if (runAll || onlyContent) await migrateContent();
  if (runAll || onlyCorporate) await migrateCorporateList(collectCorporateUrls());

  const entries: MapEntry[] = [...urlMap.entries()].map(([from, to]) => ({
    from,
    to,
    key: keyForUrl(from) ?? "",
    ok: true
  }));
  if (!dryRun && entries.length) saveMap(entries);

  console.log(`\nDone. ${urlMap.size} URLs in map. Set NEXT_PUBLIC_MEDIA_CDN_URL=${process.env.AWS_CLOUDFRONT_URL ?? "(your CDN)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
