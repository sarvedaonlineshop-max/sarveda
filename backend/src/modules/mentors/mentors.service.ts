import { prisma } from "../../config/db";

export type MentorListItem = {
  id: string;
  slug: string;
  name: string;
  expertise: string | null;
  photoUrl: string | null;
};

export type MentorDetail = MentorListItem & {
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function listActiveMentors(): Promise<MentorListItem[]> {
  return prisma.mentor.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      expertise: true,
      photoUrl: true
    }
  });
}

export async function getMentorBySlug(slug: string): Promise<MentorDetail | null> {
  return prisma.mentor.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      expertise: true,
      photoUrl: true,
      bio: true,
      seoTitle: true,
      seoDescription: true
    }
  });
}

export async function listMentorSlugs(): Promise<string[]> {
  const rows = await prisma.mentor.findMany({
    where: { isActive: true },
    select: { slug: true },
    orderBy: { slug: "asc" }
  });
  return rows.map((r) => r.slug);
}
