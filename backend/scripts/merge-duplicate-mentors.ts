/**
 * Merge known duplicate mentor rows and re-link courses.
 *
 *   npx tsx scripts/merge-duplicate-mentors.ts [--dry-run]
 */
import dotenv from "dotenv";
import path from "path";

import { PrismaClient } from "@prisma/client";
import {
  MENTOR_ALIAS_GROUPS,
  mentorDataScore,
  normalizeMentorNameKey,
  pickRichestMentor
} from "../src/utils/mentor-aliases";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function relinkCourses(idMap: Map<string, string>): Promise<number> {
  if (idMap.size === 0) return 0;
  const courses = await prisma.course.findMany({ select: { id: true, extra: true } });
  let updated = 0;

  for (const course of courses) {
    const extra = { ...((course.extra ?? {}) as Record<string, unknown>) };
    let changed = false;

    if (Array.isArray(extra.mentorIds)) {
      const next = [...new Set((extra.mentorIds as string[]).map((id) => idMap.get(id) ?? id))];
      if (JSON.stringify(next) !== JSON.stringify(extra.mentorIds)) {
        extra.mentorIds = next;
        changed = true;
      }
    }

    if (Array.isArray(extra.sessions)) {
      extra.sessions = (extra.sessions as Array<Record<string, unknown>>).map((s) => {
        const mentorId = s.mentorId as string | undefined;
        if (!mentorId || !idMap.has(mentorId)) return s;
        changed = true;
        return { ...s, mentorId: idMap.get(mentorId) };
      });
    }

    const mentorIds = Array.isArray(extra.mentorIds) ? (extra.mentorIds as string[]) : [];
    if (mentorIds.length) {
      const resolved = await prisma.mentor.findMany({
        where: { id: { in: mentorIds } },
        select: { id: true, name: true, bio: true, photoUrl: true, expertise: true }
      });
      const order = new Map(mentorIds.map((id, i) => [id, i]));
      const teachers = resolved
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .map((m) => ({
          name: m.name,
          bio: m.bio,
          imageUrl: m.photoUrl,
          designation: m.expertise
        }));
      if (JSON.stringify(teachers) !== JSON.stringify(extra.teachers)) {
        extra.teachers = teachers;
        changed = true;
      }
    }

    if (changed) {
      if (!dryRun) {
        await prisma.course.update({ where: { id: course.id }, data: { extra } });
      }
      updated++;
    }
  }

  return updated;
}

async function main() {
  const allMentors = await prisma.mentor.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      bio: true,
      photoUrl: true,
      expertise: true,
      seoTitle: true,
      seoDescription: true
    }
  });

  const idMap = new Map<string, string>();
  let mergedGroups = 0;
  let deleted = 0;

  for (const group of MENTOR_ALIAS_GROUPS) {
    const keys = new Set(group.map(normalizeMentorNameKey));
    const matches = allMentors.filter((m) => keys.has(normalizeMentorNameKey(m.name)));
    if (matches.length <= 1) {
      if (matches.length === 1) {
        console.log(`• ${group.join(" / ")} — already single row (${matches[0]!.name})`);
      } else {
        console.log(`• ${group.join(" / ")} — no rows found`);
      }
      continue;
    }

    const keeper = pickRichestMentor(matches);
    const losers = matches.filter((m) => m.id !== keeper.id);
    mergedGroups++;

    console.log(
      `\nMerge: ${matches.map((m) => m.name).join(", ")} → keep "${keeper.name}" (score ${mentorDataScore(keeper)})`
    );

    const merged = {
      bio: keeper.bio,
      photoUrl: keeper.photoUrl,
      expertise: keeper.expertise,
      seoTitle: keeper.seoTitle,
      seoDescription: keeper.seoDescription
    };
    for (const loser of losers) {
      if (!merged.bio?.trim() && loser.bio?.trim()) merged.bio = loser.bio;
      if (!merged.photoUrl?.trim() && loser.photoUrl?.trim()) merged.photoUrl = loser.photoUrl;
      if (!merged.expertise?.trim() && loser.expertise?.trim()) merged.expertise = loser.expertise;
      if (!merged.seoTitle?.trim() && loser.seoTitle?.trim()) merged.seoTitle = loser.seoTitle;
      if (!merged.seoDescription?.trim() && loser.seoDescription?.trim()) {
        merged.seoDescription = loser.seoDescription;
      }
      idMap.set(loser.id, keeper.id);
      console.log(`  drop "${loser.name}" (${loser.id})`);
    }

    if (!dryRun) {
      await prisma.mentor.update({
        where: { id: keeper.id },
        data: merged
      });
      for (const loser of losers) {
        await prisma.mentor.delete({ where: { id: loser.id } });
        deleted++;
      }
    }
  }

  const coursesUpdated = await relinkCourses(idMap);
  console.log(
    `\nDone: ${mergedGroups} alias group(s), ${deleted} duplicate row(s) removed, ${coursesUpdated} course(s) relinked.${dryRun ? " (dry-run)" : ""}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
