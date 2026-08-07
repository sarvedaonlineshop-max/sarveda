import type { Prisma, ProductStatus, ProductType } from "@prisma/client";

import { prisma } from "../../config/db";
import { getCategorySlugScope } from "../categories/categories.service";

export type ListProductsQuery = {
  page?: number;
  limit?: number;
  categorySlug?: string;
  status?: ProductStatus;
  q?: string;
};

const defaultPage = 1;
const defaultLimit = 24;
const maxLimit = 100;
const adminMaxLimit = 2000;

function httpError(status: number, message: string, code: string): Error {
  const e = new Error(message) as Error & { statusCode: number; code: string };
  e.statusCode = status;
  e.code = code;
  return e;
}

const globalProductOrderBy: Prisma.ProductOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { updatedAt: "desc" }
];

/** Resolve paginated product ids honoring global sortOrder or category position. */
async function findOrderedProductIds(
  where: Prisma.ProductWhereInput,
  categorySlugs: string[] | null,
  skip: number,
  take: number
): Promise<string[]> {
  if (!categorySlugs?.length) {
    const rows = await prisma.product.findMany({
      where,
      select: { id: true },
      orderBy: globalProductOrderBy,
      skip,
      take
    });
    return rows.map((r) => r.id);
  }

  const rows = await prisma.product.findMany({
    where,
    select: {
      id: true,
      sortOrder: true,
      updatedAt: true,
      categories: {
        where: { category: { slug: { in: categorySlugs } } },
        select: { position: true },
        orderBy: { position: "asc" },
        take: 1
      }
    }
  });

  rows.sort((a, b) => {
    const pa = a.categories[0]?.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.categories[0]?.position ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  return rows.slice(skip, skip + take).map((r) => r.id);
}

export type ListProductsAdminQuery = {
  page?: number;
  limit?: number;
  categorySlug?: string;
  q?: string;
  /** When set, filter by status; when omitted, include ACTIVE and DRAFT (excludes ARCHIVED). */
  status?: ProductStatus;
};

export async function listProductsAdmin(query: ListProductsAdminQuery) {
  const page = Math.max(1, query.page ?? defaultPage);
  const limit = Math.min(adminMaxLimit, Math.max(1, query.limit ?? 24));
  const skip = (page - 1) * limit;

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    catalogHidden: false,
    status: query.status
      ? query.status
      : {
          in: ["ACTIVE", "DRAFT"]
        }
  };

  if (query.q?.trim()) {
    where.name = { contains: query.q.trim(), mode: "insensitive" };
  }

  let categorySlugs: string[] | null = null;
  if (query.categorySlug?.trim()) {
    categorySlugs = await getCategorySlugScope(query.categorySlug.trim());
    where.categories = {
      some: {
        category: { slug: { in: categorySlugs } }
      }
    };
  }

  const total = await prisma.product.count({ where });
  const orderedIds = await findOrderedProductIds(where, categorySlugs, skip, limit);
  const rowsUnsorted =
    orderedIds.length === 0
      ? []
      : await prisma.product.findMany({
          where: { id: { in: orderedIds } },
          include: {
            images: {
              where: { isPrimary: true },
              take: 1
            },
            variants: {
              orderBy: [{ isDefault: "desc" }, { saleInPaise: "asc" }],
              include: { inventory: true }
            },
            categories: {
              include: { category: true },
              take: 4
            }
          }
        });
  const byId = new Map(rowsUnsorted.map((p) => [p.id, p]));
  const rows = orderedIds.map((id) => byId.get(id)).filter(Boolean) as typeof rowsUnsorted;

  const items = rows.map((p) => {
    const img = p.images[0]?.url ?? null;
    const activeVariants = p.variants.filter((v) => v.status === "ACTIVE");
    const totalOnHand = activeVariants.reduce(
      (sum, v) => sum + (v.inventory?.onHand ?? 0),
      0
    );
    const primaryVariant = activeVariants.find((v) => v.isDefault) ?? activeVariants[0];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      productType: p.productType,
      primaryImageUrl: img,
      fromPriceInPaise: primaryVariant?.saleInPaise ?? null,
      fromMrpInPaise: primaryVariant?.mrpInPaise ?? null,
      fromSaleUsdCents: primaryVariant?.saleUsdCents ?? null,
      fromMrpUsdCents: primaryVariant?.mrpUsdCents ?? null,
      fromSaleGbpPence: primaryVariant?.saleGbpPence ?? null,
      fromMrpGbpPence: primaryVariant?.mrpGbpPence ?? null,
      totalOnHand,
      categories: p.categories.map((pc) => ({
        id: pc.category.id,
        slug: pc.category.slug,
        name: pc.category.name
      }))
    };
  });

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

export async function getProductAdminById(id: string) {
  const product = await prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      variants: {
        orderBy: [{ isDefault: "desc" }, { sku: "asc" }],
        include: {
          inventory: true,
          shippingRates: true,
          attributeValues: {
            include: {
              attributeValue: {
                include: { attribute: true }
              }
            }
          }
        }
      },
      images: { orderBy: { position: "asc" } },
      categories: { include: { category: true } },
      accordionItems: { orderBy: { position: "asc" } }
    }
  });
  if (!product) {
    throw httpError(404, "Product not found", "NOT_FOUND");
  }
  return product;
}

export async function listProducts(query: ListProductsQuery) {
  const page = Math.max(1, query.page ?? defaultPage);
  const limit = Math.min(maxLimit, Math.max(1, query.limit ?? defaultLimit));
  const skip = (page - 1) * limit;

  const status: ProductStatus = query.status ?? "ACTIVE";

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    status,
    catalogHidden: false
  };

  if (query.q?.trim()) {
    const q = query.q.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { shortDescription: { contains: q, mode: "insensitive" } },
      { categories: { some: { category: { name: { contains: q, mode: "insensitive" } } } } }
    ];
  }

  let categorySlugs: string[] | null = null;
  if (query.categorySlug?.trim()) {
    categorySlugs = await getCategorySlugScope(query.categorySlug.trim());
    where.categories = {
      some: {
        category: { slug: { in: categorySlugs } }
      }
    };
  }

  const total = await prisma.product.count({ where });
  const orderedIds = await findOrderedProductIds(where, categorySlugs, skip, limit);
  const rowsUnsorted =
    orderedIds.length === 0
      ? []
      : await prisma.product.findMany({
          where: { id: { in: orderedIds } },
          include: {
            images: {
              where: { isPrimary: true },
              take: 1
            },
            variants: {
              where: { status: "ACTIVE" },
              orderBy: [{ isDefault: "desc" }, { saleInPaise: "asc" }],
              take: 1
            },
            categories: {
              include: { category: true },
              take: 3
            }
          }
        });
  const byId = new Map(rowsUnsorted.map((p) => [p.id, p]));
  const rows = orderedIds.map((id) => byId.get(id)).filter(Boolean) as typeof rowsUnsorted;

  const items = rows.map((p) => {
    const img = p.images[0]?.url ?? null;
    const v = p.variants[0];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      shortDescription: p.shortDescription,
      status: p.status,
      productType: p.productType,
      hasAudio: p.hasAudio,
      primaryImageUrl: img,
      fromPriceInPaise: v?.saleInPaise ?? null,
      fromMrpInPaise: v?.mrpInPaise ?? null,
      fromSaleUsdCents: v?.saleUsdCents ?? null,
      fromMrpUsdCents: v?.mrpUsdCents ?? null,
      fromSaleGbpPence: v?.saleGbpPence ?? null,
      fromMrpGbpPence: v?.mrpGbpPence ?? null,
      defaultVariantId: v?.id ?? null,
      categories: p.categories.map((pc) => ({
        slug: pc.category.slug,
        name: pc.category.name
      }))
    };
  });

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

export type ReorderProductsInput = {
  categorySlug?: string | null;
  orderedIds: string[];
};

/** Persist admin drag-reorder: global Product.sortOrder or ProductCategory.position. */
export async function reorderProducts(input: ReorderProductsInput) {
  const orderedIds = input.orderedIds;
  if (orderedIds.length === 0) {
    throw httpError(400, "orderedIds is required", "VALIDATION_ERROR");
  }
  if (orderedIds.length > adminMaxLimit) {
    throw httpError(400, `At most ${adminMaxLimit} products can be reordered`, "VALIDATION_ERROR");
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw httpError(400, "Duplicate product ids", "VALIDATION_ERROR");
  }

  const slug = input.categorySlug?.trim() || null;

  if (!slug) {
    const found = await prisma.product.findMany({
      where: { id: { in: orderedIds }, deletedAt: null },
      select: { id: true }
    });
    if (found.length !== orderedIds.length) {
      throw httpError(400, "Unknown or deleted product ids", "VALIDATION_ERROR");
    }
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.product.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );
    return { mode: "global" as const, count: orderedIds.length };
  }

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) {
    throw httpError(404, "Category not found", "NOT_FOUND");
  }

  const scopeSlugs = await getCategorySlugScope(slug);
  const inScope = await prisma.product.findMany({
    where: {
      id: { in: orderedIds },
      deletedAt: null,
      categories: { some: { category: { slug: { in: scopeSlugs } } } }
    },
    select: { id: true }
  });
  if (inScope.length !== orderedIds.length) {
    throw httpError(400, "Some products are not in this category", "VALIDATION_ERROR");
  }

  await prisma.$transaction(
    orderedIds.map((productId, index) =>
      prisma.productCategory.upsert({
        where: {
          productId_categoryId: { productId, categoryId: category.id }
        },
        create: { productId, categoryId: category.id, position: index },
        update: { position: index }
      })
    )
  );

  return { mode: "category" as const, count: orderedIds.length, categoryId: category.id };
}

const RELATION_TYPE_ORDER: Record<string, number> = {
  PAIR_WITH: 0,
  UPSELL: 1,
  CROSS_SELL: 2
};

function mapProductListRow(p: {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  status: ProductStatus;
  productType: ProductType;
  hasAudio: boolean;
  images: Array<{ url: string }>;
  variants: Array<{
    id: string;
    saleInPaise: number;
    mrpInPaise: number;
    saleUsdCents: number | null;
    mrpUsdCents: number | null;
    saleGbpPence: number | null;
    mrpGbpPence: number | null;
  }>;
  categories: Array<{ category: { slug: string; name: string } }>;
}) {
  const img = p.images[0]?.url ?? null;
  const v = p.variants[0];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    status: p.status,
    productType: p.productType,
    hasAudio: p.hasAudio,
    primaryImageUrl: img,
    fromPriceInPaise: v?.saleInPaise ?? null,
    fromMrpInPaise: v?.mrpInPaise ?? null,
    fromSaleUsdCents: v?.saleUsdCents ?? null,
    fromMrpUsdCents: v?.mrpUsdCents ?? null,
    fromSaleGbpPence: v?.saleGbpPence ?? null,
    fromMrpGbpPence: v?.mrpGbpPence ?? null,
    defaultVariantId: v?.id ?? null,
    categories: p.categories.map((pc) => ({
      slug: pc.category.slug,
      name: pc.category.name
    }))
  };
}

const listInclude = {
  images: {
    where: { isPrimary: true },
    take: 1
  },
  variants: {
    where: { status: "ACTIVE" as const },
    orderBy: [{ isDefault: "desc" as const }, { saleInPaise: "asc" as const }],
    take: 1
  },
  categories: {
    include: { category: true },
    take: 3
  }
};

/** Curated pair-with / upsell first; category fallback when empty. */
export async function listRelatedProducts(slug: string, limit = 4) {
  const take = Math.min(8, Math.max(1, limit));
  const product = await prisma.product.findFirst({
    where: { slug, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      categories: { select: { category: { select: { slug: true } } }, take: 1 }
    }
  });
  if (!product) {
    throw httpError(404, "Product not found", "NOT_FOUND");
  }

  const relations = await prisma.productRelation.findMany({
    where: { fromProductId: product.id },
    orderBy: [{ position: "asc" }],
    include: {
      toProduct: {
        include: listInclude
      }
    }
  });

  relations.sort((a, b) => {
    const ta = RELATION_TYPE_ORDER[a.type] ?? 9;
    const tb = RELATION_TYPE_ORDER[b.type] ?? 9;
    if (ta !== tb) return ta - tb;
    return a.position - b.position;
  });

  const seen = new Set<string>();
  const curated = [];
  for (const rel of relations) {
    const p = rel.toProduct;
    if (p.deletedAt || p.status !== "ACTIVE" || p.catalogHidden) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    curated.push(mapProductListRow(p));
    if (curated.length >= take) break;
  }

  if (curated.length >= take) {
    return { items: curated, source: "curated" as const };
  }

  const categorySlug = product.categories[0]?.category.slug;
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: "ACTIVE",
    catalogHidden: false,
    id: { not: product.id, notIn: [...seen] }
  };
  if (categorySlug) {
    const slugs = await getCategorySlugScope(categorySlug);
    where.categories = { some: { category: { slug: { in: slugs } } } };
  }

  const fallbackRows = await prisma.product.findMany({
    where,
    take: take - curated.length,
    orderBy: { updatedAt: "desc" },
    include: listInclude
  });

  return {
    items: [...curated, ...fallbackRows.map(mapProductListRow)],
    source: curated.length ? ("mixed" as const) : ("category" as const)
  };
}

export async function suggestProducts(q: string, limit = 8) {
  const term = q.trim();
  if (term.length < 2) {
    return [];
  }
  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { shortDescription: { contains: term, mode: "insensitive" } },
        { categories: { some: { category: { name: { contains: term, mode: "insensitive" } } } } }
      ]
    },
    take: Math.min(12, Math.max(1, limit)),
    orderBy: { updatedAt: "desc" },
    include: {
      images: { where: { isPrimary: true }, take: 1 },
      variants: {
        where: { status: "ACTIVE", isDefault: true },
        take: 1
      }
    }
  });
  return rows.map((p) => ({
    slug: p.slug,
    name: p.name,
    imageUrl: p.images[0]?.url ?? null,
    priceInPaise: p.variants[0]?.saleInPaise ?? null
  }));
}

export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: {
      slug,
      deletedAt: null,
      status: "ACTIVE"
    },
    include: {
      variants: {
        where: { status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { sku: "asc" }],
        include: {
          inventory: true,
          shippingRates: true,
          attributeValues: {
            include: {
              attributeValue: {
                include: { attribute: true }
              }
            }
          }
        }
      },
      images: { orderBy: { position: "asc" } },
      categories: { include: { category: true } },
      accordionItems: { orderBy: { position: "asc" } }
    }
  });

  if (!product) {
    throw httpError(404, "Product not found", "NOT_FOUND");
  }

  return product;
}

export async function createProduct(input: {
  slug: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  productType: ProductType;
  status?: ProductStatus;
  taxClass?: string | null;
  hasAudio?: boolean;
  audioUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeyword?: string | null;
  wooCommerceId?: number | null;
  categoryIds?: string[];
  variants?: Array<{
    sku: string;
    mrpInPaise: number;
    saleInPaise: number;
    mrpUsdCents?: number | null;
    saleUsdCents?: number | null;
    mrpGbpPence?: number | null;
    saleGbpPence?: number | null;
    weightGrams?: number | null;
    isDefault?: boolean;
    status?: "ACTIVE" | "INACTIVE";
  }>;
}) {
  const existing = await prisma.product.findUnique({ where: { slug: input.slug } });
  if (existing) {
    throw httpError(409, "Slug already in use", "SLUG_EXISTS");
  }

  const product = await prisma.product.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: input.description ?? undefined,
      shortDescription: input.shortDescription ?? undefined,
      productType: input.productType,
      status: input.status ?? "DRAFT",
      taxClass: input.taxClass ?? "standard",
      hasAudio: input.hasAudio ?? false,
      audioUrl: input.audioUrl || undefined,
      seoTitle: input.seoTitle ?? undefined,
      seoDescription: input.seoDescription ?? undefined,
      seoKeyword: input.seoKeyword ?? undefined,
      wooCommerceId: input.wooCommerceId ?? undefined,
      categories: input.categoryIds?.length
        ? {
            create: input.categoryIds.map((categoryId) => ({ categoryId }))
          }
        : undefined,
      variants: input.variants?.length
        ? {
            create: input.variants.map((v, i) => ({
              sku: v.sku,
              mrpInPaise: v.mrpInPaise,
              saleInPaise: v.saleInPaise,
              mrpUsdCents: v.mrpUsdCents ?? undefined,
              saleUsdCents: v.saleUsdCents ?? undefined,
              mrpGbpPence: v.mrpGbpPence ?? undefined,
              saleGbpPence: v.saleGbpPence ?? undefined,
              weightGrams: v.weightGrams ?? undefined,
              isDefault: v.isDefault ?? i === 0,
              status: v.status ?? "ACTIVE",
              inventory: { create: {} }
            }))
          }
        : undefined
    },
    include: {
      variants: true,
      categories: { include: { category: true } }
    }
  });

  return product;
}

export async function updateProduct(
  id: string,
  input: Partial<{
    slug: string;
    name: string;
    description: string | null;
    shortDescription: string | null;
    productType: ProductType;
    status: ProductStatus;
    taxClass: string | null;
    hasAudio: boolean;
    audioUrl: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    seoKeyword: string | null;
    wooCommerceId: number | null;
    categoryIds: string[];
  }>
) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) {
    throw httpError(404, "Product not found", "NOT_FOUND");
  }

  if (input.slug && input.slug !== existing.slug) {
    const clash = await prisma.product.findUnique({ where: { slug: input.slug } });
    if (clash) throw httpError(409, "Slug already in use", "SLUG_EXISTS");
  }

  const { categoryIds, ...scalar } = input;

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...scalar,
      audioUrl: input.audioUrl === "" ? null : input.audioUrl,
      categories: categoryIds
        ? {
            deleteMany: {},
            create: categoryIds.map((categoryId) => ({ categoryId }))
          }
        : undefined
    },
    include: {
      variants: true,
      categories: { include: { category: true } },
      images: true,
      accordionItems: true
    }
  });

  return product;
}

/** All active product URLs for sitemap.xml */
export async function listProductSitemapEntries(): Promise<
  Array<{ slug: string; updatedAt: Date }>
> {
  const rows = await prisma.product.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" }
  });
  return rows;
}
