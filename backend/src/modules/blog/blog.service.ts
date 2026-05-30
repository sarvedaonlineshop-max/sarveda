import type { PostStatus } from "@prisma/client";

import { prisma } from "../../config/db";

export type BlogListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  seoKeyword: string | null;
};

export type BlogDetail = BlogListItem & {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeyword: string | null;
};

function mapListRow(row: {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  seoKeyword: string | null;
}): BlogListItem {
  return {
    ...row,
    publishedAt: row.publishedAt?.toISOString() ?? null
  };
}

export async function listPublishedPosts(): Promise<BlogListItem[]> {
  const rows = await prisma.blogPost.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { title: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      imageUrl: true,
      publishedAt: true,
      seoKeyword: true
    }
  });
  return rows.map(mapListRow);
}

export async function getPostBySlug(slug: string): Promise<BlogDetail | null> {
  const row = await prisma.blogPost.findFirst({
    where: { slug, status: "PUBLISHED" as PostStatus },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      imageUrl: true,
      publishedAt: true,
      seoTitle: true,
      seoDescription: true,
      seoKeyword: true
    }
  });
  if (!row) return null;
  return {
    ...mapListRow(row),
    content: row.content,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    seoKeyword: row.seoKeyword
  };
}

export async function listPostSlugs(): Promise<string[]> {
  const rows = await prisma.blogPost.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
    orderBy: { slug: "asc" }
  });
  return rows.map((r) => r.slug);
}
