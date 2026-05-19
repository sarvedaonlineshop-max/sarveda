/**
 * Import published events from WordPress WXR.
 * Usage: npx tsx scripts/import-events-wxr.ts [--dry-run]
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";
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
  readWxr
} from "./wxr-utils";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath = path.resolve(__dirname, "../../data/sarveda-events.xml");

function eventDates(meta: Record<string, string>) {
  const start =
    parseWpDate(meta.event_date_start || meta.event_date, meta.event_time_start || meta.event_time) ??
    new Date();
  const end = parseWpDate(meta.event_date_end, meta.event_time_end) ?? null;
  return { start, end };
}

async function main() {
  const xml = readWxr(xmlPath);
  const items = parseItems(xml);
  const attachments = buildAttachmentMap(items);

  let imported = 0;
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
    const imageUrl = thumbId ? attachments.get(thumbId) ?? null : meta.event_banner || null;

    const inr = parseIntSafe(meta.event_price_inr);
    const priceInPaise = inr > 0 ? toPaise(inr) : 0;
    const usdRaw = parseFloat((meta.event_price_usd || "0").replace(/,/g, ""));
    const priceUsdCents = usdRaw > 0 ? toUsdCents(usdRaw) : null;

    const zoomLink = meta.event_zoom_link?.trim() || null;
    const venue = meta.event_location?.trim() || null;
    const { start, end } = eventDates(meta);
    const enrollmentMode = inferEnrollmentMode(priceInPaise, description);

    const extra = {
      organizer: meta.event_organizer || null,
      video: meta.event_video || null,
      speaker: meta.speaker_section_speaker_name
        ? {
            name: meta.speaker_section_speaker_name,
            designation: meta.speaker_section_speaker_designation,
            image: meta.speaker_section_speaker_image,
            about: meta.speaker_section_about_speaker
          }
        : undefined
    };

    console.log(`→ event ${slug} [${enrollmentMode}] ${start.toISOString().slice(0, 10)}`);

    if (dryRun) continue;

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

    await prisma.event.upsert({
      where: { slug },
      create: {
        slug,
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
        extra: extra as object,
        status: "PUBLISHED",
        seoTitle: meta._yoast_wpseo_title || null,
        seoDescription: meta._yoast_wpseo_metadesc || null
      },
      update: {
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
        extra: extra as object,
        status: "PUBLISHED",
        seoTitle: meta._yoast_wpseo_title || null,
        seoDescription: meta._yoast_wpseo_metadesc || null
      }
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} events.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
