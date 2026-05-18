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

function httpError(status: number, message: string, code: string): Error {
  const e = new Error(message) as Error & { statusCode: number; code: string };
  e.statusCode = status;
  e.code = code;
  return e;
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
  const limit = Math.min(100, Math.max(1, query.limit ?? 24));
  const skip = (page - 1) * limit;

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: query.status
      ? query.status
      : {
          in: ["ACTIVE", "DRAFT"]
        }
  };

  if (query.q?.trim()) {
    where.name = { contains: query.q.trim(), mode: "insensitive" };
  }

  if (query.categorySlug?.trim()) {
    const slugs = await getCategorySlugScope(query.categorySlug.trim());
    where.categories = {
      some: {
        category: { slug: { in: slugs } }
      }
    };
  }

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
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
    })
  ]);

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
        include: { inventory: true, shippingRates: true }
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
    status
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

  if (query.categorySlug?.trim()) {
    const slugs = await getCategorySlugScope(query.categorySlug.trim());
    where.categories = {
      some: {
        category: { slug: { in: slugs } }
      }
    };
  }

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
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
    })
  ]);

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
