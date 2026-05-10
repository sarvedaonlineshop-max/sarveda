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
