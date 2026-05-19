import { prisma } from "../../config/db";

export type VaidyaListItem = {
  id: string;
  slug: string;
  name: string;
  speciality: string | null;
  photoUrl: string | null;
};

export type VaidyaDetail = VaidyaListItem & {
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function listActiveVaidyas(): Promise<VaidyaListItem[]> {
  return prisma.vaidya.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      speciality: true,
      photoUrl: true
    }
  });
}

export async function getVaidyaBySlug(slug: string): Promise<VaidyaDetail | null> {
  return prisma.vaidya.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      speciality: true,
      photoUrl: true,
      bio: true,
      seoTitle: true,
      seoDescription: true
    }
  });
}

export async function listVaidyaSlugs(): Promise<string[]> {
  const rows = await prisma.vaidya.findMany({
    where: { isActive: true },
    select: { slug: true },
    orderBy: { slug: "asc" }
  });
  return rows.map((r) => r.slug);
}
