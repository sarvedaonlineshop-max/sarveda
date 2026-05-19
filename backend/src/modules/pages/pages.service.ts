import type { PostStatus } from "@prisma/client";

import { prisma } from "../../config/db";

export type CmsPagePublic = {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  template: string | null;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export async function getPageBySlug(slug: string): Promise<CmsPagePublic | null> {
  const row = await prisma.cmsPage.findFirst({
    where: { slug, status: "PUBLISHED" as PostStatus },
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      template: true,
      imageUrl: true,
      seoTitle: true,
      seoDescription: true
    }
  });
  return row;
}

export async function listPageSlugs(): Promise<string[]> {
  const rows = await prisma.cmsPage.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
    orderBy: { slug: "asc" }
  });
  return rows.map((r) => r.slug);
}
