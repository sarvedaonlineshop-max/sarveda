import { PrismaClient, ProductStatus, ProductType, VariantStatus } from "@prisma/client";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { parseDecimal, toGbpPence, toPaise, toUsdCents } from "../src/utils/money";
import { slugify } from "../src/utils/slugify";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();
const PRODUCTS_ONLY = process.argv.includes("--products-only");

type Row = string[];

type WooRow = {
  wooId: number;
  type: string;
  row: Row;
};

function col(idx: Record<string, number>, row: Row, name: string): string {
  const i = idx[name];
  if (i === undefined || i >= row.length) return "";
  return (row[i] ?? "").trim();
}

function parseParentWooId(parentCell: string, skuToParentWooId: Map<string, number>): number | null {
  const raw = parentCell.trim();
  const m = raw.match(/id:(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (raw && skuToParentWooId.has(raw)) return skuToParentWooId.get(raw)!;
  return null;
}

function normalizeCountry(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const u = t.toUpperCase();
  if (u === "IN" || u.includes("INDIA")) return "IN";
  if (u === "US" || u === "USA" || u.includes("UNITED STATES")) return "US";
  if (u === "GB" || u === "UK" || u.includes("UNITED KINGDOM")) return "GB";
  return "OTHER";
}

function moneyForCountry(country: string, raw: string): number {
  const d = parseDecimal(raw);
  if (d == null) return 0;
  if (country === "IN") return toPaise(d);
  if (country === "US" || country === "OTHER") return toUsdCents(d);
  if (country === "GB") return toGbpPence(d);
  return toUsdCents(d);
}

function pick(
  idx: Record<string, number>,
  variation: Row,
  parent: Row | null,
  key: string
): string {
  const v = col(idx, variation, key);
  if (v) return v;
  if (parent) return col(idx, parent, key);
  return "";
}

/** Woo CSV export rarely fills Stock (~99%); blank means “not in file”, not necessarily zero units. */
const DEFAULT_ON_HAND_UNTRACKED_IN_EXPORT = 999;

function parseOnHand(idx: Record<string, number>, row: Row, parent: Row | null): number {
  const stockRaw = parent ? pick(idx, row, parent, "Stock") : col(idx, row, "Stock");
  const trimmed = stockRaw.trim().replace(/\s/g, "");
  if (trimmed !== "") {
    const stock = parseInt(trimmed, 10);
    if (Number.isFinite(stock) && stock >= 0) return stock;
  }
  return DEFAULT_ON_HAND_UNTRACKED_IN_EXPORT;
}

function extractShipping(
  idx: Record<string, number>,
  row: Row,
  parent: Row | null
): Array<{
  country: string;
  standardPerProduct: number;
  standardAdditional: number;
  expeditedPerProduct: number;
  expeditedAdditional: number;
  codPerProduct: number | null;
  codAdditional: number | null;
}> {
  const out: Array<{
    country: string;
    standardPerProduct: number;
    standardAdditional: number;
    expeditedPerProduct: number;
    expeditedAdditional: number;
    codPerProduct: number | null;
    codAdditional: number | null;
  }> = [];

  for (let n = 0; n < 6; n++) {
    const countryRaw = pick(idx, row, parent, `Meta: shipping_prices_${n}_country_name`);
    const country = normalizeCountry(countryRaw);
    if (!country) continue;

    const std = pick(idx, row, parent, `Meta: shipping_prices_${n}_standard_shipping_per_product`);
    const stdAdd = pick(
      idx,
      row,
      parent,
      `Meta: shipping_prices_${n}_standard_shipping_additional_product`
    );
    const exp = pick(
      idx,
      row,
      parent,
      `Meta: shipping_prices_${n}_expedited_shipping_per_product`
    );
    const expAddTypo = pick(
      idx,
      row,
      parent,
      `Meta: shipping_prices_${n}_expedited_shipping_addtional_product`
    );
    const expAdd = pick(
      idx,
      row,
      parent,
      `Meta: shipping_prices_${n}_expedited_shipping_additional_product`
    );
    const cod = pick(idx, row, parent, `Meta: shipping_prices_${n}_cod_for_india`);
    const codAdd = pick(
      idx,
      row,
      parent,
      `Meta: shipping_prices_${n}_cod_for_india_shipping_additional_product`
    );

    out.push({
      country,
      standardPerProduct: moneyForCountry(country, std),
      standardAdditional: moneyForCountry(country, stdAdd || "0"),
      expeditedPerProduct: moneyForCountry(country, exp),
      expeditedAdditional: moneyForCountry(
        country,
        (expAddTypo || expAdd || "0") as string
      ),
      codPerProduct: cod ? moneyForCountry(country, cod) : null,
      codAdditional: codAdd ? moneyForCountry(country, codAdd) : null
    });
  }

  return out;
}

function parsePublished(raw: string): ProductStatus {
  return raw === "1" ? "ACTIVE" : "DRAFT";
}

function firstAudioUrl(idx: Record<string, number>, row: Row): string | null {
  for (let i = 0; i < 12; i++) {
    const k = `Meta: product_audio_${i}_audio`;
    const u = col(idx, row, k);
    if (u && u.startsWith("http")) return u;
  }
  const simple = col(idx, row, "Meta: simple_product_0_audio");
  if (simple && simple.startsWith("http")) return simple;
  return null;
}

function accordionItems(idx: Record<string, number>, row: Row): Array<{ title: string; content: string }> {
  const items: Array<{ title: string; content: string }> = [];
  for (let n = 1; n <= 30; n++) {
    const title = col(idx, row, `Meta: product_description_accordion_item_${n}_title`);
    const content = col(idx, row, `Meta: product_description_accordion_item_${n}_description`);
    if (!title && !content) continue;
    if (title.startsWith("field_")) continue;
    items.push({
      title: title || `Section ${n}`,
      content: content || ""
    });
  }
  return items;
}

function variantPrices(idx: Record<string, number>, row: Row) {
  const regInr =
    parseDecimal(col(idx, row, "Meta: _india_regular_price")) ??
    parseDecimal(col(idx, row, "Regular price"));
  const saleInr =
    parseDecimal(col(idx, row, "Meta: _india_sale_price")) ??
    parseDecimal(col(idx, row, "Sale price"));

  const regUsd = parseDecimal(col(idx, row, "Meta: _dollars-zone_regular_price"));
  const saleUsd = parseDecimal(col(idx, row, "Meta: _dollars-zone_sale_price"));

  const z1r = parseDecimal(col(idx, row, "Meta: _zone-1_regular_price"));
  const z2r = parseDecimal(col(idx, row, "Meta: _zone-2_regular_price"));
  const z1s = parseDecimal(col(idx, row, "Meta: _zone-1_sale_price"));
  const z2s = parseDecimal(col(idx, row, "Meta: _zone-2_sale_price"));
  const regGbp = z1r ?? z2r;
  const saleGbp = z1s ?? z2s;

  const mrpInPaise = regInr != null ? toPaise(regInr) : 0;
  const saleInPaise = saleInr != null ? toPaise(saleInr) : mrpInPaise;

  const mrpUsdCents = regUsd != null ? toUsdCents(regUsd) : null;
  const saleUsdCents = saleUsd != null ? toUsdCents(saleUsd) : mrpUsdCents;

  const mrpGbpPence = regGbp != null ? toGbpPence(regGbp) : null;
  const saleGbpPence = saleGbp != null ? toGbpPence(saleGbp) : mrpGbpPence;

  return {
    mrpInPaise: mrpInPaise || 0,
    saleInPaise: saleInPaise || mrpInPaise || 0,
    mrpUsdCents,
    saleUsdCents,
    mrpGbpPence,
    saleGbpPence
  };
}

async function clearCatalog() {
  await prisma.$transaction([
    prisma.variantShippingRate.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.variantAttributeValue.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.accordionItem.deleteMany(),
    prisma.productCategory.deleteMany(),
    prisma.review.deleteMany(),
    prisma.wishlist.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany()
  ]);
}

async function main() {
  const csvPath = path.join(__dirname, "wc-products.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Missing ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(raw, {
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true
  }) as Row[];

  if (rows.length < 2) {
    throw new Error("CSV has no data rows");
  }

  const header = rows[0];
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    if (!(h in idx)) idx[h] = i;
  });

  const dataRows = rows.slice(1);
  const byWooId = new Map<number, Row>();
  const parents: WooRow[] = [];
  const variations: WooRow[] = [];

  for (const row of dataRows) {
    if (!row.length) continue;
    const wooId = parseInt(row[0], 10);
    if (!Number.isFinite(wooId)) continue;
    const type = (row[idx["Type"]] ?? "").trim().toLowerCase();
    byWooId.set(wooId, row);
    if (type === "simple" || type === "variable") {
      parents.push({ wooId, type, row });
    } else if (type === "variation") {
      variations.push({ wooId, type, row });
    }
  }

  console.log(
    `Parsed CSV: ${parents.length} parent products, ${variations.length} variations`
  );

  if (!PRODUCTS_ONLY) {
    await clearCatalog();
  } else {
    console.log("Products-only mode: preserving existing catalog data and updating SEO fields only.");
  }

  const categoryPathToId = new Map<string, string>();

  async function ensureCategoryPath(pathStr: string): Promise<string> {
    const key = pathStr.toLowerCase().trim();
    if (categoryPathToId.has(key)) return categoryPathToId.get(key)!;

    const segments = pathStr
      .split(">")
      .map((s) => s.trim())
      .filter(Boolean);
    let parentId: string | null = null;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const pathSoFar = segments.slice(0, i + 1).join(" > ");
      const mapKey = pathSoFar.toLowerCase();
      if (categoryPathToId.has(mapKey)) {
        parentId = categoryPathToId.get(mapKey)!;
        continue;
      }

      const catSlug = slugify(pathSoFar);
      let cat = await prisma.category.findFirst({
        where: { slug: catSlug }
      });
      if (!cat) {
        cat = await prisma.category.create({
          data: {
            slug: catSlug,
            name: seg,
            parentId
          }
        });
      }
      categoryPathToId.set(mapKey, cat.id);
      parentId = cat.id;
    }

    categoryPathToId.set(key, parentId!);
    return parentId!;
  }

  const skuToParentWooId = new Map<string, number>();
  for (const p of parents) {
    const sku = col(idx, p.row, "SKU").trim();
    if (sku) skuToParentWooId.set(sku, p.wooId);
  }

  const productWooToUuid = new Map<number, string>();
  const slugRegistry = new Map<string, number>();

  function uniqueSlug(name: string, wooId: number): string {
    let base = slugify(name);
    const k = base;
    const n = slugRegistry.get(k) ?? 0;
    slugRegistry.set(k, n + 1);
    if (n === 0) return base;
    return `${base}-${wooId}`;
  }

  for (const p of parents) {
    const { row, wooId } = p;
    const name = col(idx, row, "Name");
    const slug = uniqueSlug(name, wooId);
    const status = parsePublished(col(idx, row, "Published"));
    const productType: ProductType =
      p.type === "variable" ? "VARIABLE" : "SIMPLE";
    const taxClass = col(idx, row, "Tax class") || "standard";
    const description = col(idx, row, "Description") || null;
    const shortDescription = col(idx, row, "Short description") || null;
    const audioUrl = firstAudioUrl(idx, row);
    const hasAudio = !!audioUrl;
    const seoKeyword =
      col(idx, row, "Meta: _yoast_wpseo_focuskw") ||
      col(idx, row, "Meta: _yoast_wpseo_focuskeywords") ||
      null;
    const seoDescription = col(idx, row, "Meta: _yoast_wpseo_metadesc") || shortDescription || "";
    const seoTitle =
      col(idx, row, "Meta: _yoast_wpseo_title") ||
      col(idx, row, "Meta: _yoast_wpseo_focuskw") ||
      name;

    if (PRODUCTS_ONLY) {
      await prisma.product.updateMany({
        where: { slug },
        data: {
          seoTitle: seoTitle || null,
          seoDescription: seoDescription || null,
          seoKeyword: seoKeyword || null
        }
      });
      continue;
    }

    const catIds: string[] = [];
    const catsRaw = col(idx, row, "Categories");
    if (catsRaw) {
      const parts = catsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const paths = new Set<string>();
      for (const part of parts) {
        if (!part.includes(">")) continue;
        paths.add(part);
      }
      for (const pathStr of paths) {
        const id = await ensureCategoryPath(pathStr);
        if (!catIds.includes(id)) catIds.push(id);
      }
    }

    const product = await prisma.product.create({
      data: {
        slug,
        name,
        description,
        shortDescription,
        productType,
        status,
        taxClass,
        hasAudio,
        audioUrl,
        seoTitle,
        seoDescription,
        seoKeyword,
        wooCommerceId: wooId,
        categories:
          catIds.length > 0
            ? { create: catIds.map((categoryId) => ({ categoryId })) }
            : undefined
      }
    });
    productWooToUuid.set(wooId, product.id);

    const imagesRaw = col(idx, row, "Images");
    if (imagesRaw) {
      const urls = imagesRaw
        .split(",")
        .map((s) => s.trim())
        .filter((u) => u.startsWith("http"));
      let pos = 0;
      for (const url of urls) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url,
            position: pos,
            isPrimary: pos === 0,
            altText: name
          }
        });
        pos += 1;
      }
    }

    const acc = accordionItems(idx, row);
    let apos = 0;
    for (const a of acc) {
      await prisma.accordionItem.create({
        data: {
          productId: product.id,
          title: a.title,
          content: a.content,
          position: apos++
        }
      });
    }

    if (p.type === "simple") {
      const sku = col(idx, row, "SKU") || `woo-${wooId}`;
      const prices = variantPrices(idx, row);
      const onHand = parseOnHand(idx, row, null);
      const weightKg = parseDecimal(col(idx, row, "Weight (kg)"));
      const weightGrams =
        weightKg != null ? Math.round(weightKg * 1000) : null;

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku,
          mrpInPaise: prices.mrpInPaise,
          saleInPaise: prices.saleInPaise,
          mrpUsdCents: prices.mrpUsdCents,
          saleUsdCents: prices.saleUsdCents,
          mrpGbpPence: prices.mrpGbpPence,
          saleGbpPence: prices.saleGbpPence,
          weightGrams: weightGrams ?? undefined,
          isDefault: true,
          status: "ACTIVE" as VariantStatus,
          inventory: { create: { onHand } }
        }
      });

      const ship = extractShipping(idx, row, null);
      for (const s of ship) {
        await prisma.variantShippingRate.create({
          data: {
            variantId: variant.id,
            country: s.country,
            standardPerProduct: s.standardPerProduct,
            standardAdditional: s.standardAdditional,
            expeditedPerProduct: s.expeditedPerProduct,
            expeditedAdditional: s.expeditedAdditional,
            codPerProduct: s.codPerProduct,
            codAdditional: s.codAdditional
          }
        });
      }
    }
  }

  if (!PRODUCTS_ONLY) {
    for (const v of variations) {
    const { row, wooId } = v;
    const parentWoo = parseParentWooId(col(idx, row, "Parent"), skuToParentWooId);
    if (!parentWoo) {
      console.warn(`Variation ${wooId}: missing parent, skip`);
      continue;
    }
    const productId = productWooToUuid.get(parentWoo);
    if (!productId) {
      console.warn(`Variation ${wooId}: parent ${parentWoo} not found, skip`);
      continue;
    }
    const parentRow = byWooId.get(parentWoo) ?? null;

    const sku = col(idx, row, "SKU") || `woo-var-${wooId}`;
    const prices = variantPrices(idx, row);
    const onHand = parseOnHand(idx, row, parentRow);
    const weightKg = parseDecimal(col(idx, row, "Weight (kg)"));
    const weightGrams =
      weightKg != null ? Math.round(weightKg * 1000) : null;

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku,
        mrpInPaise: prices.mrpInPaise,
        saleInPaise: prices.saleInPaise,
        mrpUsdCents: prices.mrpUsdCents,
        saleUsdCents: prices.saleUsdCents,
        mrpGbpPence: prices.mrpGbpPence,
        saleGbpPence: prices.saleGbpPence,
        weightGrams: weightGrams ?? undefined,
        isDefault: false,
        status: "ACTIVE",
        inventory: { create: { onHand } }
      }
    });

    const ship = extractShipping(idx, row, parentRow);
    for (const s of ship) {
      await prisma.variantShippingRate.create({
        data: {
          variantId: variant.id,
          country: s.country,
          standardPerProduct: s.standardPerProduct,
          standardAdditional: s.standardAdditional,
          expeditedPerProduct: s.expeditedPerProduct,
          expeditedAdditional: s.expeditedAdditional,
          codPerProduct: s.codPerProduct,
          codAdditional: s.codAdditional
        }
      });
    }
    }

    const onlyVariableParents = await prisma.product.count({
      where: { productType: "VARIABLE" }
    });

    const variableProducts = await prisma.product.findMany({
      where: { productType: "VARIABLE" },
      select: { id: true }
    });

    const variableIds = variableProducts.map((p) => p.id);
    if (variableIds.length > 0) {
      await prisma.productVariant.updateMany({
        where: { productId: { in: variableIds } },
        data: { isDefault: false }
      });
    }

    for (const vp of variableProducts) {
      const first = await prisma.productVariant.findFirst({
        where: { productId: vp.id },
        orderBy: { createdAt: "asc" }
      });
      if (first) {
        await prisma.productVariant.update({
          where: { id: first.id },
          data: { isDefault: true }
        });
      }
    }
    const pCount = await prisma.product.count();
    const vCount = await prisma.productVariant.count();
    const cCount = await prisma.category.count();

    console.log(
      `Seed complete: ${pCount} products (${onlyVariableParents} variable parents), ${vCount} variants, ${cCount} categories`
    );
  } else {
    const pCount = await prisma.product.count();
    console.log(`Products-only SEO update complete for ${pCount} products.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
