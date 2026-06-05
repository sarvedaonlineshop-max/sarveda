/**
 * Build Mentor rows from all course teacher data (WXR + DB), upload photos to S3, link courses.
 *
 * Usage:
 *   npx tsx scripts/seed-mentors-from-courses.ts [--dry-run]
 *   npx tsx scripts/seed-mentors-from-courses.ts --link-only   # only refresh mentorIds on courses
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";
import { mirrorUrlToS3 } from "../src/config/s3";
import { slugify } from "../src/utils/slugify";
import {
  parseSessionsFromHtml,
  stripSessionsFromHtml
} from "../src/utils/course-sessions";
import {
  aliasGroupForName,
  namesMatchMentorAlias,
  normalizeMentorNameKey,
  pickRichestMentor
} from "../src/utils/mentor-aliases";
import { may30 } from "./migration-paths";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const linkOnly = process.argv.includes("--link-only");

type TeacherProfile = {
  name: string;
  bio: string | null;
  designation: string | null;
  imageUrl: string | null;
  sources: string[];
};

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
  while ((m = re.exec(block))) meta[m[1]] = m[2];
  return meta;
}

function decodeName(name: string): string {
  return name
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .trim();
}

function normalizeNameKey(name: string): string {
  return normalizeMentorNameKey(decodeName(name));
}

function buildAttachmentMap(xmlPaths: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const xmlPath of xmlPaths) {
    if (!fs.existsSync(xmlPath)) continue;
    const xml = fs.readFileSync(xmlPath, "utf8");
    for (const block of parseItems(xml)) {
      if (!block.includes("<wp:post_type><![CDATA[attachment]]></wp:post_type>")) continue;
      const id = cdata("wp:post_id", block);
      const url = cdata("wp:attachment_url", block) || cdata("guid", block);
      if (id && url) map.set(id, url);
    }
  }
  return map;
}

function resolveAttachment(id: string | undefined, attachments: Map<string, string>): string | null {
  if (!id?.trim()) return null;
  return attachments.get(id.trim()) ?? null;
}

function mergeTeacher(
  map: Map<string, TeacherProfile>,
  raw: { name: string; bio?: string | null; designation?: string | null; imageUrl?: string | null },
  source: string
) {
  const name = decodeName(raw.name);
  if (!name || name.length < 2) return;
  if (/^session\s+\d+/i.test(name)) return;

  const key = normalizeNameKey(name);
  const prev = map.get(key);
  map.set(key, {
    name,
    bio: raw.bio?.trim() || prev?.bio || null,
    designation: raw.designation?.trim() || prev?.designation || null,
    imageUrl: raw.imageUrl || prev?.imageUrl || null,
    sources: [...(prev?.sources ?? []), source]
  });
}

function teachersFromWxr(xmlPath: string, attachments: Map<string, string>): Map<string, TeacherProfile> {
  const map = new Map<string, TeacherProfile>();
  if (!fs.existsSync(xmlPath)) return map;

  const xml = fs.readFileSync(xmlPath, "utf8");
  for (const block of parseItems(xml)) {
    if (!block.includes("<wp:post_type><![CDATA[course]]></wp:post_type>")) continue;
    if (!block.includes("<wp:status><![CDATA[publish]]></wp:status>")) continue;

    const slug = cdata("wp:post_name", block);
    const content = cdata("content:encoded", block);
    const meta = parseMeta(block);

    const single = meta.teacher_section_teacher_name?.trim();
    if (single) {
      mergeTeacher(
        map,
        {
          name: single,
          bio: meta.teacher_section_about_teacher || null,
          designation: meta.teacher_section_teacher_designation || null,
          imageUrl: resolveAttachment(meta.teacher_section_teacher_image, attachments)
        },
        `course:${slug}:teacher_section`
      );
    }

    for (let i = 0; i < 12; i++) {
      const name = meta[`about_teachers_${i}_teacher_name`]?.trim();
      if (!name) continue;
      mergeTeacher(
        map,
        {
          name,
          bio: meta[`about_teachers_${i}_about_teacher`] || null,
          designation: meta[`about_teachers_${i}_teacher_designation`] || null,
          imageUrl: resolveAttachment(meta[`about_teachers_${i}_teacher_image`], attachments)
        },
        `course:${slug}:about_teachers_${i}`
      );
    }

    for (const session of parseSessionsFromHtml(content)) {
      if (session.teacherName) {
        mergeTeacher(map, { name: session.teacherName }, `course:${slug}:session:${session.sessionId}`);
      }
    }
  }
  return map;
}

async function teachersFromDb(): Promise<Map<string, TeacherProfile>> {
  const map = new Map<string, TeacherProfile>();
  const courses = await prisma.course.findMany({ select: { slug: true, extra: true } });
  for (const course of courses) {
    const extra = (course.extra ?? {}) as Record<string, unknown>;
    const teachers = extra.teachers;
    if (Array.isArray(teachers)) {
      for (const t of teachers) {
        if (typeof t === "string") {
          mergeTeacher(map, { name: t }, `db:${course.slug}:teachers`);
        } else if (t && typeof t === "object") {
          const row = t as Record<string, unknown>;
          mergeTeacher(
            map,
            {
              name: String(row.name ?? ""),
              bio: (row.bio as string) ?? null,
              designation: (row.designation as string) ?? null,
              imageUrl: (row.imageUrl as string) ?? null
            },
            `db:${course.slug}:teachers`
          );
        }
      }
    }
    const sessions = extra.sessions;
    if (Array.isArray(sessions)) {
      for (const s of sessions) {
        const row = s as Record<string, unknown>;
        const teacherName = row.teacherName as string | undefined;
        if (teacherName?.trim()) {
          mergeTeacher(map, { name: teacherName }, `db:${course.slug}:session`);
        }
      }
    }
  }
  return map;
}

function keyForMentorPhoto(url: string, slug: string): string {
  const prefix = "https://sarveda.com/wp-content/uploads/";
  if (url.startsWith(prefix)) {
    return `media/mentors/wp/${url.slice(prefix.length)}`;
  }
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  return `media/mentors/${slug}${ext.split("?")[0]}`;
}

async function uploadPhotoIfNeeded(sourceUrl: string | null, slug: string): Promise<string | null> {
  if (!sourceUrl?.trim()) return null;
  const url = sourceUrl.trim();
  if (url.includes("sarveda-media") || url.includes("cloudfront.net") || url.includes(".s3.")) {
    return url;
  }
  if (!url.startsWith("http")) return null;
  if (dryRun) {
    console.log(`  [dry-run] would upload photo for ${slug}: ${url.slice(0, 80)}…`);
    return url;
  }
  try {
    const key = keyForMentorPhoto(url, slug);
    const uploaded = await mirrorUrlToS3(url, key);
    return uploaded ?? url;
  } catch (e) {
    console.warn(`  photo upload failed for ${slug}:`, e instanceof Error ? e.message : e);
    return url;
  }
}

async function findMentorIdByName(name: string): Promise<string | null> {
  const key = normalizeNameKey(name);
  const mentors = await prisma.mentor.findMany({
    select: { id: true, name: true }
  });
  const aliasHit = mentors.find((m) => namesMatchMentorAlias(m.name, name));
  if (aliasHit) return aliasHit.id;
  const exact = mentors.find((m) => normalizeNameKey(m.name) === key);
  if (exact) return exact.id;
  const partial = mentors.find(
    (m) =>
      key.includes(normalizeNameKey(m.name)) || normalizeNameKey(m.name).includes(key)
  );
  return partial?.id ?? null;
}

async function linkCoursesToMentors(): Promise<void> {
  const courses = await prisma.course.findMany();
  let updated = 0;
  for (const course of courses) {
    const extra = { ...((course.extra ?? {}) as Record<string, unknown>) };
    const mentorIdSet = new Set<string>();

    const teachers = extra.teachers;
    if (Array.isArray(teachers)) {
      for (const t of teachers) {
        const name = typeof t === "string" ? t : (t as { name?: string }).name;
        if (!name) continue;
        const id = await findMentorIdByName(name);
        if (id) mentorIdSet.add(id);
      }
    }

    if (Array.isArray(extra.sessions)) {
      extra.sessions = await Promise.all(
        (extra.sessions as Array<Record<string, unknown>>).map(async (s) => {
          const teacherName = s.teacherName as string | undefined;
          if (!teacherName?.trim()) return s;
          const mentorId = await findMentorIdByName(teacherName);
          if (mentorId) {
            mentorIdSet.add(mentorId);
            return { ...s, mentorId };
          }
          return s;
        })
      );
    }

    if (mentorIdSet.size === 0 && !Array.isArray(extra.sessions)) continue;

    extra.mentorIds = [...mentorIdSet];
    if (!dryRun) {
      const resolved = await prisma.mentor.findMany({
        where: { id: { in: [...mentorIdSet] } },
        select: { id: true, name: true, bio: true, photoUrl: true, expertise: true }
      });
      const order = new Map([...mentorIdSet].map((id, i) => [id, i]));
      extra.teachers = resolved
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .map((m) => ({
          name: m.name,
          bio: m.bio,
          imageUrl: m.photoUrl,
          designation: m.expertise
        }));

      let description = course.description;
      if (extra.layoutTemplate === "SESSIONS" && description && /<h3[^>]*>\s*Session\s+\d+/i.test(description)) {
        description = stripSessionsFromHtml(description) || null;
      }

      await prisma.course.update({
        where: { id: course.id },
        data: { extra, description }
      });
    }
    updated++;
  }
  console.log(`Linked mentors on ${updated} courses.${dryRun ? " (dry-run)" : ""}`);
}

async function main() {
  if (linkOnly) {
    await linkCoursesToMentors();
    return;
  }

  const xmlPaths = [
    may30.courses(),
    path.resolve(__dirname, "../../data/sarveda.WordPress.2026-05-18.xml")
  ];
  const attachments = buildAttachmentMap(xmlPaths);

  const wxrTeachers = teachersFromWxr(may30.courses(), attachments);
  const dbTeachers = await teachersFromDb();

  const merged = new Map<string, TeacherProfile>();
  for (const [k, v] of dbTeachers) merged.set(k, v);
  for (const [k, v] of wxrTeachers) {
    const prev = merged.get(k);
    merged.set(k, prev ? { ...v, bio: v.bio || prev.bio, imageUrl: v.imageUrl || prev.imageUrl, sources: [...prev.sources, ...v.sources] } : v);
  }

  const conflicts: string[] = [];
  const compound = [...merged.values()].filter((t) => /&|,| and /i.test(t.name));
  if (compound.length) {
    conflicts.push(`Compound names kept as single mentors: ${compound.map((c) => c.name).join("; ")}`);
  }

  const collapsed = new Map<string, TeacherProfile>();
  for (const profile of merged.values()) {
    const aliasGroup = aliasGroupForName(profile.name);
    const collapseKey = aliasGroup
      ? aliasGroup.map(normalizeMentorNameKey).sort().join("|")
      : normalizeNameKey(profile.name);
    const prev = collapsed.get(collapseKey);
    if (!prev) {
      collapsed.set(collapseKey, profile);
      continue;
    }
    collapsed.set(collapseKey, {
      name: pickRichestMentor([
        { name: prev.name, bio: prev.bio, expertise: prev.designation, photoUrl: prev.imageUrl },
        { name: profile.name, bio: profile.bio, expertise: profile.designation, photoUrl: profile.imageUrl }
      ]).name,
      bio: profile.bio || prev.bio,
      designation: profile.designation || prev.designation,
      imageUrl: profile.imageUrl || prev.imageUrl,
      sources: [...prev.sources, ...profile.sources]
    });
  }

  let created = 0;
  let updated = 0;

  for (const profile of collapsed.values()) {
    const baseSlug = slugify(profile.name) || `mentor-${created}`;
    let slug = baseSlug;
    let n = 2;
    while (true) {
      const clash = await prisma.mentor.findFirst({
        where: { slug, NOT: { name: profile.name } }
      });
      if (!clash) break;
      slug = `${baseSlug}-${n++}`;
      conflicts.push(`Slug clash: "${profile.name}" → ${slug}`);
    }

    const photoUrl = await uploadPhotoIfNeeded(profile.imageUrl, slug);
    console.log(`→ mentor ${profile.name}${photoUrl ? " [photo]" : ""}`);

    if (dryRun) continue;

    const existingRows = await prisma.mentor.findMany({ select: { id: true, name: true } });
    const existing = existingRows.find((m) => namesMatchMentorAlias(m.name, profile.name));
    if (existing) {
      await prisma.mentor.update({
        where: { id: existing.id },
        data: {
          bio: profile.bio || existing.bio,
          expertise: profile.designation || existing.expertise,
          photoUrl: photoUrl || existing.photoUrl,
          isActive: true
        }
      });
      updated++;
    } else {
      await prisma.mentor.create({
        data: {
          slug,
          name: profile.name,
          bio: profile.bio,
          expertise: profile.designation,
          photoUrl,
          isActive: true
        }
      });
      created++;
    }
  }

  console.log(`\nMentors: ${created} created, ${updated} updated, ${collapsed.size} profiles.${dryRun ? " (dry-run)" : ""}`);
  if (conflicts.length) {
    console.log("\nNotes:");
    for (const c of conflicts) console.log(`  • ${c}`);
  }

  if (!dryRun) await linkCoursesToMentors();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
