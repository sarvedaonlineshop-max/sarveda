/**
 * Import published courses from WordPress WXR export.
 * Usage: npx tsx scripts/import-courses-wxr.ts [--dry-run] [path-to.xml]
 */
import { CourseEnrollmentMode, ProductStatus, ProductType, VariantStatus } from "@prisma/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";
import { toPaise, toUsdCents } from "../src/utils/money";
import {
  applySessionSchedules,
  detectLayoutTemplate,
  parseCurriculumFromMeta,
  parseSessionsFromHtml,
  stripSessionsFromHtml
} from "../src/utils/course-sessions";
import { namesMatchMentorAlias } from "../src/utils/mentor-aliases";
import { may30 } from "./migration-paths";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const xmlPath = process.argv.find((a) => a.endsWith(".xml")) ?? may30.courses();

type MetaMap = Record<string, string>;

function parseItems(xml: string): string[] {
  return xml.split(/\s*<item>/).slice(1);
}

function cdata(tag: string, block: string): string {
  const m = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (m) return m[1];
  const plain = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return plain?.[1]?.trim() ?? "";
}

function parseMeta(block: string): MetaMap {
  const meta: MetaMap = {};
  const re =
    /<wp:meta_key><!\[CDATA\[([^\]]+)\]\]><\/wp:meta_key>\s*<wp:meta_value><!\[CDATA\[([\s\S]*?)\]\]><\/wp:meta_value>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    meta[m[1]] = m[2];
  }
  return meta;
}

function parseIntSafe(v: string | undefined): number {
  if (!v?.trim()) return 0;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function inferEnrollmentMode(priceInPaise: number, html: string): CourseEnrollmentMode {
  const lower = html.toLowerCase();
  const hasEnquire =
    lower.includes("care@sarveda.com") ||
    lower.includes("whatsapp") ||
    lower.includes("write to us") ||
    lower.includes("write to care");
  if (priceInPaise <= 0) return "ENQUIRY";
  if (hasEnquire) return "BOTH";
  return "CHECKOUT";
}

type ImportedTeacher = {
  name: string;
  bio?: string | null;
  imageUrl?: string | null;
  designation?: string | null;
};

type ImportedScheduleRow = {
  startDate?: string | null;
  endDate?: string | null;
  mode?: string | null;
  location?: string | null;
  timings?: string | null;
  duration?: string | null;
};

function resolveAttachment(
  id: string | undefined,
  attachments: Map<string, string>
): string | null {
  if (!id?.trim()) return null;
  return attachments.get(id.trim()) ?? null;
}

function pickTeachers(meta: MetaMap, attachments: Map<string, string>): ImportedTeacher[] {
  const byName = new Map<string, ImportedTeacher>();

  function mergeTeacher(t: ImportedTeacher) {
    const name = t.name?.trim();
    if (!name) return;
    const prev = byName.get(name);
    byName.set(name, {
      name,
      bio: t.bio?.trim() || prev?.bio || null,
      imageUrl: t.imageUrl || prev?.imageUrl || null,
      designation: t.designation?.trim() || prev?.designation || null
    });
  }

  const singleName = meta.teacher_section_teacher_name?.trim();
  if (singleName) {
    mergeTeacher({
      name: singleName,
      bio: meta.teacher_section_about_teacher || null,
      imageUrl: resolveAttachment(meta.teacher_section_teacher_image, attachments),
      designation: meta.teacher_section_teacher_designation || null
    });
  }

  for (let i = 0; i < 12; i++) {
    const name = meta[`about_teachers_${i}_teacher_name`]?.trim();
    if (!name) continue;
    mergeTeacher({
      name,
      bio: meta[`about_teachers_${i}_about_teacher`] || null,
      imageUrl: resolveAttachment(meta[`about_teachers_${i}_teacher_image`], attachments),
      designation: meta[`about_teachers_${i}_teacher_designation`] || null
    });
  }

  return Array.from(byName.values());
}

function pickSchedule(meta: MetaMap): ImportedScheduleRow[] | undefined {
  const rows: ImportedScheduleRow[] = [];
  for (let i = 0; i < 8; i++) {
    const startDate = meta[`course_detail_table_${i}_start_date`]?.trim() || null;
    const endDate = meta[`course_detail_table_${i}_end_date`]?.trim() || null;
    const mode =
      meta[`course_detail_table_${i}_mode`]?.trim() ||
      meta[`course_detail_table_${i}_event_mode`]?.trim() ||
      null;
    const location =
      meta[`course_detail_table_${i}_location`]?.trim() ||
      meta[`course_detail_table_${i}_event_location`]?.trim() ||
      null;
    const timings = meta[`course_detail_table_${i}_course_timmings`]?.trim() || null;
    const duration = meta[`course_detail_table_${i}_duration`]?.trim() || null;
    if (!startDate && !endDate && !mode && !location && !timings && !duration) continue;
    rows.push({ startDate, endDate, mode, location, timings, duration });
  }
  return rows.length ? rows : undefined;
}

async function matchMentorIdsByNames(names: string[]): Promise<string[]> {
  const mentors = await prisma.mentor.findMany({
    where: { isActive: true },
    select: { id: true, name: true }
  });
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    const hit =
      mentors.find((m) => namesMatchMentorAlias(m.name, name)) ??
      mentors.find((m) => m.name.toLowerCase() === lower) ??
      mentors.find(
        (m) =>
          lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower)
      );
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

function pickExtra(
  meta: MetaMap,
  attachments: Map<string, string>,
  content: string,
  mentorIds: string[]
) {
  const faqs: Array<{ question: string; answer: string }> = [];
  for (let i = 0; i < 20; i++) {
    const q = meta[`faqs_${i}_question`];
    const a = meta[`faqs_${i}_answer`];
    if (q && a) faqs.push({ question: q, answer: a });
  }

  const teachers = pickTeachers(meta, attachments);
  const schedule = pickSchedule(meta);
  const firstSchedule = schedule?.[0];
  const curriculum = parseCurriculumFromMeta(meta);
  let sessions = applySessionSchedules(
    parseSessionsFromHtml(content),
    meta.course_includes
  );
  const layoutTemplate = detectLayoutTemplate({
    sessionCount: sessions.length,
    curriculumCount: curriculum.length
  });
  const durationRaw = meta.duration?.trim();
  const durationHours = durationRaw ? parseFloat(durationRaw.replace(/[^\d.]/g, "")) : null;
  const duration =
    durationHours && Number.isFinite(durationHours)
      ? durationHours === 1
        ? "1 hour"
        : `${durationHours} hours`
      : durationRaw || firstSchedule?.duration || null;

  return {
    videoLink: meta.video_link || meta.youtube_embedd || null,
    duration,
    durationHours: durationHours && Number.isFinite(durationHours) ? durationHours : null,
    layoutTemplate,
    mentorIds: mentorIds.length ? mentorIds : undefined,
    sessions: sessions.length ? sessions : undefined,
    curriculum: curriculum.length ? curriculum : undefined,
    startDate: meta.start_date || firstSchedule?.startDate || null,
    endDate: meta.end_date || firstSchedule?.endDate || null,
    mode: firstSchedule?.mode || null,
    venue: firstSchedule?.location || null,
    timings: firstSchedule?.timings || null,
    courseIncludes: meta.course_includes || null,
    aboutTheCourse: meta.about_the_course || null,
    teachers: teachers.length ? teachers : undefined,
    schedule,
    faqs: faqs.length ? faqs : undefined
  };
}

async function ensureCheckoutVariant(
  courseSlug: string,
  title: string,
  priceInPaise: number,
  priceUsdCents: number | null,
  imageUrl: string | null
): Promise<string | null> {
  if (priceInPaise <= 0) return null;
  const productSlug = `course-checkout-${courseSlug}`;
  const sku = `COURSE-${courseSlug.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 40)}`;

  if (dryRun) {
    console.log(`  [dry-run] would create checkout product ${productSlug} sku=${sku}`);
    return null;
  }

  const product = await prisma.product.upsert({
    where: { slug: productSlug },
    create: {
      slug: productSlug,
      name: title,
      shortDescription: `Course enrollment: ${title}`,
      productType: ProductType.DIGITAL,
      status: ProductStatus.ACTIVE,
      catalogHidden: true,
      taxClass: "gst-zero-rate"
    },
    update: {
      name: title,
      catalogHidden: true,
      status: ProductStatus.ACTIVE
    }
  });

  if (imageUrl) {
    const existing = await prisma.productImage.findFirst({
      where: { productId: product.id, isPrimary: true }
    });
    if (!existing) {
      await prisma.productImage.create({
        data: { productId: product.id, url: imageUrl, isPrimary: true, position: 0 }
      });
    }
  }

  const mrp = priceInPaise;
  const variant = await prisma.productVariant.upsert({
    where: { sku },
    create: {
      productId: product.id,
      sku,
      mrpInPaise: mrp,
      saleInPaise: mrp,
      saleUsdCents: priceUsdCents ?? undefined,
      mrpUsdCents: priceUsdCents ?? undefined,
      isDefault: true,
      status: VariantStatus.ACTIVE,
      weightGrams: 0
    },
    update: {
      mrpInPaise: mrp,
      saleInPaise: mrp,
      saleUsdCents: priceUsdCents ?? undefined,
      mrpUsdCents: priceUsdCents ?? undefined,
      status: VariantStatus.ACTIVE
    }
  });

  await prisma.inventory.upsert({
    where: { variantId: variant.id },
    create: { variantId: variant.id, onHand: 999, reserved: 0 },
    update: { onHand: 999 }
  });

  return variant.id;
}

async function main() {
  if (!fs.existsSync(xmlPath)) {
    console.error(`File not found: ${xmlPath}`);
    process.exit(1);
  }
  const xml = fs.readFileSync(xmlPath, "utf8");
  const items = parseItems(xml);

  const attachments = new Map<string, string>();
  for (const block of items) {
    if (!block.includes("<wp:post_type><![CDATA[attachment]]></wp:post_type>")) continue;
    const id = cdata("wp:post_id", block);
    const url = cdata("wp:attachment_url", block) || cdata("guid", block);
    if (id && url) attachments.set(id, url);
  }

  let imported = 0;
  for (const block of items) {
    if (!block.includes("<wp:post_type><![CDATA[course]]></wp:post_type>")) continue;
    const status = cdata("wp:status", block);
    if (status !== "publish") continue;

    const slug = cdata("wp:post_name", block);
    const title = cdata("title", block);
    const description = cdata("content:encoded", block);
    const shortDescription = cdata("excerpt:encoded", block) || null;
    const meta = parseMeta(block);
    const wpPostId = parseIntSafe(cdata("wp:post_id", block));

    const thumbId = meta._thumbnail_id;
    const imageUrl = thumbId ? attachments.get(thumbId) ?? null : null;

    const inr = parseIntSafe(meta.course_price_inr);
    const usdRaw = parseFloat((meta.course_price_usd || "0").replace(/,/g, ""));
    const priceUsdCents = usdRaw > 0 ? toUsdCents(usdRaw) : null;
    const priceInPaise = inr > 0 ? toPaise(inr) : 0;
    const enrollmentMode = inferEnrollmentMode(priceInPaise, description);
    const isFree = priceInPaise <= 0;

    const seoTitle = meta._yoast_wpseo_title || null;
    const seoDescription = meta._yoast_wpseo_metadesc || null;
    const videoUrl = meta.video_link || meta.youtube_embedd || null;
    const teacherNames = pickTeachers(meta, attachments).map((t) => t.name);
    const mentorIds = dryRun ? [] : await matchMentorIdsByNames(teacherNames);
    const extra = pickExtra(meta, attachments, description, mentorIds);
    const courseDescription =
      extra.layoutTemplate === "SESSIONS" && extra.sessions?.length
        ? stripSessionsFromHtml(description) || null
        : description || null;

    console.log(`→ ${slug} [${enrollmentMode}] ₹${inr}`);

    if (dryRun) continue;

    const variantId =
      enrollmentMode === "ENQUIRY"
        ? null
        : await ensureCheckoutVariant(slug, title, priceInPaise, priceUsdCents, imageUrl);

    await prisma.course.upsert({
      where: { slug },
      create: {
        slug,
        title,
        description: courseDescription,
        shortDescription,
        priceInPaise,
        priceUsdCents,
        isFree,
        imageUrl,
        videoUrl,
        enrollmentMode,
        checkoutVariantId: variantId,
        wpPostId: wpPostId || null,
        extra: extra as object,
        status: "PUBLISHED",
        seoTitle,
        seoDescription
      },
      update: {
        title,
        description: courseDescription,
        shortDescription,
        priceInPaise,
        priceUsdCents,
        isFree,
        imageUrl,
        videoUrl,
        enrollmentMode,
        checkoutVariantId: variantId,
        wpPostId: wpPostId || null,
        extra: extra as object,
        status: "PUBLISHED",
        seoTitle,
        seoDescription
      }
    });
    imported++;
  }

  console.log(`\nDone. Imported ${imported} published courses.${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
