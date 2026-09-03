import { prisma } from "../../config/db";
import { isCourseUpcomingExtra } from "../../utils/courseSchedule";
import { productSearchOrClause, tokenizeProductQuery } from "../products/productSearch";

export type SiteSearchType = "product" | "course" | "event" | "insight";

export type SiteSearchSuggestion = {
  type: SiteSearchType;
  slug: string;
  title: string;
  imageUrl: string | null;
  priceInPaise: number | null;
  /** Short label for UI, e.g. "Course · Upcoming" */
  label: string;
};

async function checkoutOnlyProductIds(): Promise<Set<string>> {
  const [courseVariants, eventVariants, digitalProducts] = await Promise.all([
    prisma.course.findMany({
      where: { checkoutVariantId: { not: null } },
      select: { checkoutVariantId: true }
    }),
    prisma.event.findMany({
      where: { checkoutVariantId: { not: null } },
      select: { checkoutVariantId: true }
    }),
    prisma.product.findMany({
      where: {
        OR: [{ slug: "__digital-checkout__" }, { productType: "DIGITAL" }, { catalogHidden: true }]
      },
      select: { id: true }
    })
  ]);
  const variantIds = [
    ...courseVariants.map((c) => c.checkoutVariantId),
    ...eventVariants.map((e) => e.checkoutVariantId)
  ].filter((id): id is string => Boolean(id));

  const ids = new Set(digitalProducts.map((p) => p.id));
  if (!variantIds.length) return ids;

  const rows = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { productId: true }
  });
  for (const r of rows) ids.add(r.productId);
  return ids;
}

export async function suggestSiteSearch(q: string, limit = 10): Promise<SiteSearchSuggestion[]> {
  const term = q.trim();
  if (term.length < 2) return [];

  const perType = Math.max(3, Math.ceil(limit / 4));
  const productLimit = Math.min(12, Math.max(limit, perType * 2));
  const excludeProductIds = await checkoutOnlyProductIds();
  const now = new Date();
  const tokens = tokenizeProductQuery(term);
  const productWhere = tokens.length ? productSearchOrClause(tokens) : undefined;

  const [products, courses, events, posts] = await Promise.all([
    prisma.product.findMany({
      where: {
        deletedAt: null,
        status: "ACTIVE",
        catalogHidden: false,
        id: excludeProductIds.size ? { notIn: [...excludeProductIds] } : undefined,
        ...(productWhere ?? {})
      },
      take: productLimit,
      orderBy: { sortOrder: "asc" },
      include: {
        images: { where: { isPrimary: true }, take: 1 },
        variants: { where: { status: "ACTIVE", isDefault: true }, take: 1 }
      }
    }),
    prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { shortDescription: { contains: term, mode: "insensitive" } }
        ]
      },
      take: perType,
      orderBy: { updatedAt: "desc" },
      select: {
        slug: true,
        title: true,
        imageUrl: true,
        priceInPaise: true,
        isFree: true,
        extra: true,
        enrollmentMode: true
      }
    }),
    prisma.event.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { shortDescription: { contains: term, mode: "insensitive" } }
        ]
      },
      take: perType,
      orderBy: { startDate: "desc" },
      select: {
        slug: true,
        title: true,
        imageUrl: true,
        priceInPaise: true,
        startDate: true
      }
    }),
    prisma.blogPost.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { excerpt: { contains: term, mode: "insensitive" } }
        ]
      },
      take: perType,
      orderBy: { publishedAt: "desc" },
      select: {
        slug: true,
        title: true,
        imageUrl: true
      }
    })
  ]);

  const out: SiteSearchSuggestion[] = [];

  for (const p of products) {
    out.push({
      type: "product",
      slug: p.slug,
      title: p.name,
      imageUrl: p.images[0]?.url ?? null,
      priceInPaise: p.variants[0]?.saleInPaise ?? null,
      label: "Product"
    });
  }

  for (const c of courses) {
    const upcoming = isCourseUpcomingExtra(c.extra, now);
    const canPay =
      upcoming && (c.enrollmentMode === "CHECKOUT" || c.enrollmentMode === "BOTH") && !c.isFree;
    out.push({
      type: "course",
      slug: c.slug,
      title: c.title,
      imageUrl: c.imageUrl,
      priceInPaise: canPay ? c.priceInPaise : c.isFree ? 0 : null,
      label: upcoming ? "Course · Registration open" : "Course"
    });
  }

  for (const e of events) {
    const upcoming = e.startDate >= now;
    out.push({
      type: "event",
      slug: e.slug,
      title: e.title,
      imageUrl: e.imageUrl,
      priceInPaise: e.priceInPaise > 0 ? e.priceInPaise : null,
      label: upcoming ? "Event · Upcoming" : "Event"
    });
  }

  for (const post of posts) {
    out.push({
      type: "insight",
      slug: post.slug,
      title: post.title,
      imageUrl: post.imageUrl,
      priceInPaise: null,
      label: "Insight"
    });
  }

  return out.slice(0, limit);
}
