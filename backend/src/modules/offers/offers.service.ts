import { prisma } from "../../config/db";

export type OfferListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
};

export type OfferDetail = OfferListItem & {
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function listActiveOffers(): Promise<OfferListItem[]> {
  return prisma.offer.findMany({
    where: { isActive: true },
    orderBy: { title: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      imageUrl: true
    }
  });
}

export async function getOfferBySlug(slug: string): Promise<OfferDetail | null> {
  return prisma.offer.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      imageUrl: true,
      seoTitle: true,
      seoDescription: true
    }
  });
}

export async function listOfferSlugs(): Promise<string[]> {
  const rows = await prisma.offer.findMany({
    where: { isActive: true },
    select: { slug: true },
    orderBy: { slug: "asc" }
  });
  return rows.map((r) => r.slug);
}
