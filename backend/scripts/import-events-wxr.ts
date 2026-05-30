/**
 * Import published events from WordPress WXR.
 * Usage: npx tsx scripts/import-events-wxr.ts [--dry-run]
 */
import dotenv from "dotenv";
import path from "path";

import { Prisma, PrismaClient } from "@prisma/client";
import { toPaise, toUsdCents } from "../src/utils/money";
import { ensureCheckoutVariant } from "./wxr-checkout";
import {
  buildAttachmentMap,
  cdata,
  inferEnrollmentMode,
  parseIntSafe,
  parseItems,
  parseMeta,
  parseWpDate,
  readWxr,
  resolveMediaRef,
  toPrismaJson
} from "./wxr-utils";
import { may30 } from "./migration-paths";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath = process.argv.find((a) => a.endsWith(".xml")) ?? may30.events();

function eventDates(meta: Record<string, string>) {
  const start =
    parseWpDate(meta.event_date_start || meta.event_date, meta.event_time_start || meta.event_time) ??
    new Date();
  const end = parseWpDate(meta.event_date_end, meta.event_time_end) ?? null;
  return { start, end };
}

async function assertEventSchemaReady(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT "shortDescription", "enrollmentMode", "extra", "updatedAt" FROM "Event" LIMIT 1`;
  } catch (err) {
    console.error(
      "\nEvent table is missing new columns. On the server run:\n  npx prisma migrate deploy\n  npx prisma generate\n"
    );
    throw err;
  }
}

function buildEventExtra(meta: Record<string, string>, attachments: Map<string, string>) {
  const speakerName = meta.speaker_section_speaker_name?.trim();
  const payload: Record<string, unknown> = {
    organizer: meta.event_organizer?.trim() || null,
    video: meta.event_video?.trim() || null
  };
  if (speakerName) {
    payload.speaker = {
      name: speakerName,
      designation: meta.speaker_section_speaker_designation?.trim() || null,
      image: resolveMediaRef(meta.speaker_section_speaker_image, attachments),
      about: meta.speaker_section_about_speaker?.trim() || null
    };
  }
  return toPrismaJson(payload);
}

async function main() {
  if (!dryRun) await assertEventSchemaReady();

  const xml = readWxr(xmlPath);
  const items = parseItems(xml);
  const attachments = buildAttachmentMap(items);

  let imported = 0;
  let failed = 0;

  for (const block of items) {
    if (!block.includes("<wp:post_type><![CDATA[event]]></wp:post_type>")) continue;
    if (!block.includes("<wp:status><![CDATA[publish]]></wp:status>")) continue;

    const slug = cdata("wp:post_name", block);
    const title = cdata("title", block);
    const description = cdata("content:encoded", block);
    const shortDescription = cdata("excerpt:encoded", block) || null;
    const meta = parseMeta(block);
    const wpPostId = parseIntSafe(cdata("wp:post_id", block));

    const thumbId = meta._thumbnail_id;
    const imageUrl =
      resolveMediaRef(thumbId, attachments) ?? resolveMediaRef(meta.event_banner, attachments);

    const inr = parseIntSafe(meta.event_price_inr);
    const priceInPaise = inr > 0 ? toPaise(inr) : 0;
    const usdRaw = parseFloat((meta.event_price_usd || "0").replace(/,/g, ""));
    const priceUsdCents = usdRaw > 0 ? toUsdCents(usdRaw) : null;

    const zoomLink = meta.event_zoom_link?.trim() || null;
    const venue = meta.event_location?.trim() || null;
    const { start, end } = eventDates(meta);
    const enrollmentMode = inferEnrollmentMode(priceInPaise, description);
    const extra = buildEventExtra(meta, attachments);

    console.log(`→ event ${slug} [${enrollmentMode}] ${start.toISOString().slice(0, 10)}`);

    if (dryRun) continue;

    try {
      const variantId =
        enrollmentMode === "ENQUIRY"
          ? null
          : await ensureCheckoutVariant(prisma, {
              slugPrefix: "event",
              contentSlug: slug,
              title,
              priceInPaise,
              priceUsdCents,
              imageUrl,
              dryRun: false
            });

      const data = {
        title,
        description: description || null,
        shortDescription,
        startDate: start,
        endDate: end,
        venue,
        isOnline: Boolean(zoomLink),
        zoomLink,
        priceInPaise,
        imageUrl,
        enrollmentMode,
        checkoutVariantId: variantId,
        wpPostId: wpPostId || null,
        extra: extra === null ? Prisma.JsonNull : extra,
        status: "PUBLISHED" as const,
        seoTitle: meta._yoast_wpseo_title?.trim() || null,
        seoDescription: meta._yoast_wpseo_metadesc?.trim() || null
      };

      await prisma.event.upsert({
        where: { slug },
        create: { slug, ...data },
        update: data
      });
      imported++;
    } catch (err) {
      failed++;
      console.error(`✗ failed ${slug}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nDone. Imported ${imported} events, ${failed} failed.${dryRun ? " (dry-run)" : ""}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
