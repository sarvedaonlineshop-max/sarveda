import { prisma } from "../../config/db";

export type RetreatListItem = {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  location: string | null;
  duration: string | null;
  priceInPaise: number | null;
};

export type RetreatDetail = RetreatListItem & {
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function listActiveRetreats(): Promise<RetreatListItem[]> {
  return prisma.retreat.findMany({
    where: { isActive: true },
    orderBy: { title: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      imageUrl: true,
      location: true,
      duration: true,
      priceInPaise: true
    }
  });
}

export async function getRetreatBySlug(slug: string): Promise<RetreatDetail | null> {
  return prisma.retreat.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      title: true,
      imageUrl: true,
      location: true,
      duration: true,
      priceInPaise: true,
      description: true,
      seoTitle: true,
      seoDescription: true
    }
  });
}

export async function listRetreatSlugs(): Promise<string[]> {
  const rows = await prisma.retreat.findMany({
    where: { isActive: true },
    select: { slug: true },
    orderBy: { slug: "asc" }
  });
  return rows.map((r) => r.slug);
}
