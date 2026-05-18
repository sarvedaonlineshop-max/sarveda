import { prisma } from "../../config/db";

export type CategoryNode = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  seoTitle: string | null;
  seoDescription: string | null;
  children: CategoryNode[];
};

export type CategoryPublic = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  parent: { slug: string; name: string } | null;
};

export async function getCategoryTree(): Promise<CategoryNode[]> {
  const rows = await prisma.category.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }]
  });

  const byParent = new Map<string | null, typeof rows>();
  for (const c of rows) {
    const key = c.parentId;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }

  function build(parentId: string | null): CategoryNode[] {
    const list = byParent.get(parentId) ?? [];
    return list.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      imageUrl: c.imageUrl,
      position: c.position,
      seoTitle: c.seoTitle,
      seoDescription: c.seoDescription,
      children: build(c.id)
    }));
  }

  return build(null);
}

export async function getCategoryBySlug(slug: string): Promise<CategoryPublic | null> {
  const row = await prisma.category.findUnique({
    where: { slug },
    include: {
      parent: { select: { slug: true, name: true } }
    }
  });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    parent: row.parent ? { slug: row.parent.slug, name: row.parent.name } : null
  };
}

export function flattenCategorySlugs(nodes: CategoryNode[]): string[] {
  const out: string[] = [];
  const walk = (list: CategoryNode[]) => {
    for (const n of list) {
      out.push(n.slug);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
