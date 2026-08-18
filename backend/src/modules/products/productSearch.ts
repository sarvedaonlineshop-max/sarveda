import type { Prisma } from "@prisma/client";

/** Split like Advanced Woo Search: each word/number is a match token. */
export function tokenizeProductQuery(q: string): string[] {
  const tokens = q
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return [...new Set(tokens)];
}

function containsToken(haystack: string | null | undefined, token: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(token);
}

/** Match a product if ANY token hits ANY searchable field (AWS-style combinations). */
export function productSearchOrClause(tokens: string[]): Prisma.ProductWhereInput {
  const or: Prisma.ProductWhereInput[] = [];
  for (const token of tokens) {
    or.push(
      { name: { contains: token, mode: "insensitive" } },
      { slug: { contains: token, mode: "insensitive" } },
      { shortDescription: { contains: token, mode: "insensitive" } },
      { description: { contains: token, mode: "insensitive" } },
      { seoTitle: { contains: token, mode: "insensitive" } },
      { seoKeyword: { contains: token, mode: "insensitive" } },
      {
        categories: {
          some: {
            category: {
              OR: [
                { name: { contains: token, mode: "insensitive" } },
                { slug: { contains: token, mode: "insensitive" } }
              ]
            }
          }
        }
      },
      {
        variants: {
          some: {
            OR: [
              { sku: { contains: token, mode: "insensitive" } },
              {
                attributeValues: {
                  some: {
                    attributeValue: {
                      OR: [
                        { value: { contains: token, mode: "insensitive" } },
                        { slug: { contains: token, mode: "insensitive" } }
                      ]
                    }
                  }
                }
              }
            ]
          }
        }
      }
    );
  }
  return { OR: or };
}

export type ProductSearchScoreRow = {
  name: string;
  slug: string;
  shortDescription: string | null;
  seoTitle: string | null;
  seoKeyword: string | null;
  categories: Array<{ category: { name: string; slug: string } }>;
  variants: Array<{
    sku: string;
    attributeValues: Array<{ attributeValue: { value: string; slug: string } }>;
  }>;
};

export function scoreProductSearch(row: ProductSearchScoreRow, tokens: string[]): number {
  let score = 0;
  let nameHits = 0;
  for (const token of tokens) {
    if (containsToken(row.name, token)) {
      score += 100;
      nameHits += 1;
    }
    if (containsToken(row.slug, token)) score += 70;
    if (row.variants.some((v) => containsToken(v.sku, token))) score += 50;
    if (
      row.variants.some((v) =>
        v.attributeValues.some(
          (av) => containsToken(av.attributeValue.value, token) || containsToken(av.attributeValue.slug, token)
        )
      )
    ) {
      score += 35;
    }
    if (
      row.categories.some(
        (c) => containsToken(c.category.name, token) || containsToken(c.category.slug, token)
      )
    ) {
      score += 25;
    }
    if (containsToken(row.shortDescription, token) || containsToken(row.seoTitle, token)) score += 12;
    if (containsToken(row.seoKeyword, token)) score += 8;
  }
  if (tokens.length > 1 && nameHits === tokens.length) score += 180;
  return score;
}
