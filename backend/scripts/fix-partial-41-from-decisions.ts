/**
 * Fix variant axes + rebuild per user decisions in partial-41-variant-decisions.json.
 * Also realigns DO attribute axes for all 41 partial-batch products.
 *
 * Usage (Lightsail):
 *   npx tsx scripts/fix-partial-41-from-decisions.ts
 *   npx tsx scripts/fix-partial-41-from-decisions.ts --apply
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import {
  PrismaClient,
  ProductStatus,
  ProductType,
  VariantStatus,
} from "@prisma/client";

import { mirrorUrlToS3 } from "../src/config/s3";
import {
  syncVariantAttributes,
  type VariantAttributeInput,
} from "../src/modules/products/variant-attributes";
import { parseDecimal, toPaise } from "../src/utils/money";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const REPO = path.resolve(__dirname, "../..");
const DO_PRODUCTS = path.join(REPO, "data/compare/do_products.csv");
const DO_VARIANTS = path.join(REPO, "data/compare/do_variants.csv");
const DO_ATTACHMENTS = path.join(REPO, "data/compare/do_attachments.csv");
const WC_PRODUCTS = path.join(REPO, "backend/prisma/wc-products.csv");
const DECISIONS = path.join(REPO, "data/compare/partial-41-variant-decisions.json");
const BACKUP_DIR = path.join(REPO, "data/compare/live-partial-41-fix-backups");

const STOCK = 100;

const ALL_41_SLUGS = [
  "7-chakras-copper-bottles-with-handle", "7-chakras-plain-copper-bottles",
  "7-chakras-vintage-copper-bottles", "7-chakras-yoga-mats", "angel-tuning-forks",
  "ankh", "bamboo-castanet", "bamboo-rainstick-wide-80cm", "32-bar-rod-chime",
  "box-tanpura", "caxixi", "chau-gongs", "coconut-maracas-shakers",
  "crescent-zafu-cushion-compact-buck-wheat", "crescent-zafu-cushion-wide-cotton",
  "large-tuning-fork", "dotted-singing-bowl", "elemental-chimes", "etched-gongs",
  "etched-handmade-singing-bowls", "handheld-natural-coconut-shaker",
  "jala-neti-pot-ceramic-185-ml", "macrame-yoga-mat-straps", "mini-coconut-shakers-3-types",
  "painted-egg-shakers", "plain-yoga-mats", "pulse-tubes", "rectangular-yoga-bolster",
  "sacred-symbols-singing-bowls", "shruti-box", "singing-bowl-bags",
  "singing-bowls-silk-ring-cushion-accessories", "singing-bowls-with-sacred-mantra-printed",
  "thunder-tube-basic-edition", "tingsha-bell", "universal-bowl", "wind-gong-plain",
  "wooden-hand-taal-khartal", "yoga-mats-lotus", "zafu-zabuton-combo-lotus-embroidery",
  "zafu-zabuton-combo-plain",
];

const WOO_OVERRIDES: Record<string, number> = {
  "7-chakras-plain-copper-bottles": 5675,
};

type DoVar = {
  id: string;
  parentId: string;
  sku: string;
  attrs: Record<string, string>;
  attrList: VariantAttributeInput[];
  axisSlugs: string[];
  regularPrice: string;
  salePrice: string;
  title: string;
  thumbId: string;
};

type DecisionRow = {
  decision: string;
  lsProductName: string;
  lsVariantName: string;
  lsSku: string;
  doProductName: string;
  doVariantName: string;
  doSku: string;
  note: string;
};

const actions: string[] = [];
function log(msg: string) {
  console.log(msg);
  actions.push(msg);
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/-/g, " ");
}

function slugFromAttrKey(key: string): string {
  const k = key.replace(/^attribute_pa_/, "").replace(/^attribute_/, "");
  if (k === "color") return "color";
  if (k === "colour") return "colour";
  return k.replace(/_/g, "-");
}

function displayNameFromSlug(slug: string): string {
  const map: Record<string, string> = {
    color: "Color",
    colour: "Colour",
    grip: "Grip",
    size: "Size",
    type: "Type",
    "bottle-type": "Bottle Type",
    "cleaning-brush": "Cleaning Brush",
  };
  return map[slug] || slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function parseDoAttrsRaw(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const seg of (attrs || "").split(";")) {
    if (!seg.includes("=")) continue;
    const [k, ...rest] = seg.split("=");
    const v = rest.join("=").trim().replace(/-/g, " ");
    if (v) out[k.trim()] = v;
  }
  return out;
}

function buildDoVar(row: Record<string, string>): DoVar {
  const raw = parseDoAttrsRaw(row.attrs || "");
  const entries = Object.entries(raw).filter(([, v]) => v.trim());
  const attrList: VariantAttributeInput[] = entries.map(([k, v]) => {
    const slug = slugFromAttrKey(k);
    return { name: displayNameFromSlug(slug), slug, value: v };
  });
  const axisSlugs = attrList.map((a) => a.slug!);
  return {
    id: row.id,
    parentId: row.parent_id,
    sku: row.sku || "",
    attrs: Object.fromEntries(entries.map(([k, v]) => [slugFromAttrKey(k), v])),
    attrList,
    axisSlugs,
    regularPrice: row.regular_price || "",
    salePrice: row.sale_price || "",
    title: row.title || "",
    thumbId: row.thumb_id || "",
  };
}

function loadCatalog() {
  const products = new Map<string, Record<string, string>>();
  for (const r of parse(fs.readFileSync(DO_PRODUCTS, "utf8"), { columns: true, bom: true }) as Record<string, string>[]) {
    products.set(r.id, r);
  }
  const byParent = new Map<string, DoVar[]>();
  for (const r of parse(fs.readFileSync(DO_VARIANTS, "utf8"), { columns: true, bom: true }) as Record<string, string>[]) {
    if ((r.status || "").toLowerCase() !== "publish") continue;
    const dv = buildDoVar(r);
    const list = byParent.get(dv.parentId) || [];
    list.push(dv);
    byParent.set(dv.parentId, list);
  }
  const attachments = new Map<string, string>();
  for (const r of parse(fs.readFileSync(DO_ATTACHMENTS, "utf8"), { columns: true, bom: true }) as Record<string, string>[]) {
    if (r.url) attachments.set(String(r.id), r.url.trim());
  }
  return { products, byParent, attachments };
}

function priceFromDo(regular: string, sale: string, skip = false) {
  if (skip) return null;
  const saleN = parseDecimal(sale);
  const regN = parseDecimal(regular);
  const effective = saleN ?? regN;
  if (effective == null || effective <= 0) return null;
  const mrp = regN ?? effective;
  const saleP = saleN ?? regN ?? effective;
  return { mrpInPaise: toPaise(Math.max(mrp, saleP)), saleInPaise: toPaise(saleP) };
}

function computeAxisOrder(pool: DoVar[], force?: string[]): string[] {
  if (force?.length) return force;
  if (!pool.length) return [];
  const keys = new Set<string>();
  for (const v of pool) for (const s of v.axisSlugs) keys.add(s);
  const slugs = [...keys];
  const varying = slugs.filter((slug) => {
    const vals = new Set(pool.map((v) => norm(v.attrs[slug] || "")).filter(Boolean));
    return vals.size > 1;
  });
  const order = varying.length ? varying : slugs.filter((slug) => pool.some((v) => v.attrs[slug]));
  const sizeFirst = ["size", "colour", "color", "grip", "type"];
  return order.sort((a, b) => {
    const ia = sizeFirst.indexOf(a);
    const ib = sizeFirst.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

function tokenMatch(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  const nx = x.replace(/[^a-z0-9]/g, "");
  const ny = y.replace(/[^a-z0-9]/g, "");
  return nx === ny || nx.includes(ny) || ny.includes(nx);
}

function matchDoVar(pool: DoVar[], tokens: string[]): DoVar | null {
  const t = tokens.map(norm).filter(Boolean);
  if (!t.length) return null;
  const hits = pool.filter((dv) => {
    const vals = Object.values(dv.attrs);
    return t.every((tok) => vals.some((v) => tokenMatch(tok, v)));
  });
  if (hits.length === 1) return hits[0];
  return null;
}

function loadDecisions(): Map<string, Map<string, DecisionRow>> {
  const byProduct = new Map<string, Map<string, DecisionRow>>();
  if (!fs.existsSync(DECISIONS)) return byProduct;
  const rows = JSON.parse(fs.readFileSync(DECISIONS, "utf8")) as DecisionRow[];
  for (const r of rows) {
    if (!r.lsSku) continue;
    const slugGuess = r.lsProductName;
    let slug = "";
    for (const s of ALL_41_SLUGS) {
      // resolved later by product name match
    }
    const key = r.lsSku;
    // index by sku globally; also build per slug later from DB
    if (!byProduct.has("_sku")) byProduct.set("_sku", new Map());
    byProduct.get("_sku")!.set(key, r);
  }
  return byProduct;
}

function decisionForSku(skuMap: Map<string, DecisionRow>, sku: string): DecisionRow | null {
  return skuMap.get(sku) ?? null;
}

function isSkipPrice(dec: string): boolean {
  const d = dec.toLowerCase();
  return d.includes("price leave it blank") || d.includes("leave it blank");
}

function isFullRebuildProduct(dec: string): boolean {
  const d = dec.toLowerCase();
  return d.includes("delete the complete lightsail") || d.includes("delete all variants");
}

function isRemoveAndFetch(dec: string): boolean {
  const d = dec.toLowerCase();
  return d.includes("remove it from light sail") || d.includes("fetch from do");
}

function isNewVariant(dec: string): boolean {
  return dec.toLowerCase().includes("new vairant") || dec.toLowerCase().includes("new variant");
}

function shouldInactivate(dec: string): boolean {
  return isRemoveAndFetch(dec) && !dec.toLowerCase().includes("retain sku");
}

/** Plain / 7-chakras yoga mat SKU decode */
const GRIP_MAP: Record<string, string> = { M: "Moderate", S: "Superior" };
const COLOR_MAP: Record<string, string> = {
  O: "Orange", P: "Pink", T: "Teal", Y: "Yellow", B: "Blue", G: "Green",
};

function decodeYogaMatSku(sku: string): string[] {
  const m = sku.match(/YO-M-CT(?:-[7CL]+)?-([MS])-([A-Z]+)$/i);
  if (!m) return [];
  return [GRIP_MAP[m[1]!.toUpperCase()] || m[1]!, COLOR_MAP[m[2]!.toUpperCase()] || m[2]!];
}

const ETCHED_TYPE: Record<string, string> = {
  B: "Buddha",
  BE: "Buddhas Eyes",
  SG: "Sacred Geometry",
  GF: "Golden Feet",
  C: "Chakras",
  OM: "Om",
  FL: "Flower of Life",
  DJ: "Dorje",
  YY: "Yin Yang",
  M: "Mantra",
  T: "Tara",
};

function decodeEtchedSku(sku: string): string[] {
  const m = sku.match(/MI-SB-HM-ET-([A-Z]+)-([\d.]+)/i);
  if (!m) return [];
  const type = ETCHED_TYPE[m[1]!.toUpperCase()] || m[1]!;
  return [type, `${m[2]} in`];
}

async function syncProductCopy(slug: string, wooId: number, doP: Record<string, string>) {
  const wcRows = parse(fs.readFileSync(WC_PRODUCTS, "utf8"), { relax_column_count: true, bom: true }) as string[][];
  const header = wcRows[0]!;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const row = wcRows.find((r) => r[0] === String(wooId));
  const description = row?.[idx.Description] || doP.description || "";
  const shortDescription = row?.[idx["Short description"]] || "";

  const product = await prisma.product.findFirst({ where: { slug } });
  if (!product) return;

  const accordion: Array<{ title: string; content: string }> = [];
  if (row) {
    for (let n = 1; n <= 30; n++) {
      const title = (row[idx[`Meta: product_description_accordion_item_${n}_title`]] || "").trim();
      const content = (row[idx[`Meta: product_description_accordion_item_${n}_description`]] || "").trim();
      if (!title && !content) continue;
      if (title.startsWith("field_")) continue;
      accordion.push({ title, content });
    }
  }

  if (!APPLY) {
    log(`  copy: desc+${accordion.length} accordion for ${slug}`);
    return;
  }

  await prisma.product.update({
    where: { id: product.id },
    data: {
      description: description || product.description,
      shortDescription: shortDescription || product.shortDescription,
      seoTitle: doP.name || product.name,
    },
  });
  await prisma.accordionItem.deleteMany({ where: { productId: product.id } });
  for (let i = 0; i < accordion.length; i++) {
    const a = accordion[i]!;
    await prisma.accordionItem.create({
      data: { productId: product.id, title: a.title, content: a.content, position: i },
    });
  }
}

async function upsertVariantFromDo(opts: {
  productId: string;
  slug: string;
  sku: string;
  doVar: DoVar;
  axisOrder: string[];
  skipPrice?: boolean;
  attachments: Map<string, string>;
  doP: Record<string, string>;
}) {
  const prices = priceFromDo(opts.doVar.regularPrice, opts.doVar.salePrice, opts.skipPrice);
  let variant = await prisma.productVariant.findFirst({
    where: { productId: opts.productId, sku: opts.sku },
  });

  const dup = await prisma.productVariant.findFirst({
    where: { sku: opts.sku, productId: { not: opts.productId } },
    include: { productRel: { select: { slug: true } } },
  });
  if (dup) {
    log(`  SKIP SKU conflict ${opts.sku} on ${dup.productRel.slug}`);
    return false;
  }

  if (!APPLY) {
    log(`  UPSERT ${opts.sku} ← DO ${opts.doVar.id} attrs=[${opts.doVar.attrList.map((a) => a.value).join(" / ")}]${opts.skipPrice ? " (price skip)" : ""}`);
    return true;
  }

  if (!variant) {
    variant = await prisma.productVariant.create({
      data: {
        productId: opts.productId,
        sku: opts.sku,
        mrpInPaise: prices?.mrpInPaise ?? 0,
        saleInPaise: prices?.saleInPaise ?? 0,
        status: VariantStatus.ACTIVE,
        inventory: { create: { onHand: STOCK, reserved: 0, lowStockThreshold: 5 } },
      },
    });
  } else {
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        status: VariantStatus.ACTIVE,
        ...(prices ? { mrpInPaise: prices.mrpInPaise, saleInPaise: prices.saleInPaise } : {}),
      },
    });
    await prisma.inventory.upsert({
      where: { variantId: variant.id },
      create: { variantId: variant.id, onHand: STOCK, reserved: 0, lowStockThreshold: 5 },
      update: { onHand: STOCK },
    });
  }

  // Filter attrs: drop constant type=Large etc when only 1 colour axis intended
  let attrs = opts.doVar.attrList;
  if (opts.axisOrder.length === 1 && opts.axisOrder[0] === "colour") {
    attrs = attrs.filter((a) => a.slug === "colour");
  }

  await syncVariantAttributes(variant.id, attrs);
  await prisma.product.update({
    where: { id: opts.productId },
    data: { variantAxisOrder: opts.axisOrder },
  });

  const thumbId = opts.doVar.thumbId || opts.doP.thumb_id;
  const imgUrl = thumbId ? opts.attachments.get(String(thumbId)) : null;
  if (imgUrl) {
    try {
      const ext = path.extname(new URL(imgUrl).pathname) || ".jpg";
      const key = `products/${opts.slug}/variants/${opts.sku}${ext}`;
      const mirrored = (await mirrorUrlToS3(imgUrl, key)) || imgUrl;
      const existing = await prisma.productImage.findFirst({ where: { variantId: variant.id } });
      if (existing) {
        await prisma.productImage.update({ where: { id: existing.id }, data: { url: mirrored } });
      } else {
        await prisma.productImage.create({
          data: { productId: opts.productId, variantId: variant.id, url: mirrored, position: 0, isPrimary: false },
        });
      }
    } catch {
      /* ignore mirror fail */
    }
  }
  return true;
}

async function deactivateVariant(variantId: string, sku: string) {
  log(`  INACTIVE ${sku}`);
  if (!APPLY) return;
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { status: VariantStatus.INACTIVE, isDefault: false },
  });
}

function fuzzyLsSkuForDo(
  doVar: DoVar,
  lsByTokens: Map<string, string>,
  slug: string
): string | null {
  const vals = Object.values(doVar.attrs).map(norm);
  const key = vals.sort().join("|");
  if (lsByTokens.has(key)) return lsByTokens.get(key)!;

  // silk cushion: colour + size
  if (slug.includes("silk-ring")) {
    const colour = doVar.attrs.colour || doVar.attrs.color || "";
    const size = doVar.attrs.size || "";
    for (const [k, sku] of lsByTokens) {
      if (tokenMatch(k, `${colour}|${size}`) || tokenMatch(k, `${size}|${colour}`)) return sku;
    }
  }
  return null;
}

async function rebuildFromDo(opts: {
  slug: string;
  wooId: number;
  pool: DoVar[];
  axisOrder?: string[];
  skuForDo: (doVar: DoVar) => string | null;
  keepSkus?: Set<string>;
  skipPriceSkus?: Set<string>;
  attachments: Map<string, string>;
  doP: Record<string, string>;
  deactivateUnmatched?: boolean;
}) {
  const product = await prisma.product.findFirst({
    where: { slug: opts.slug },
    include: { variants: { where: { status: "ACTIVE" } } },
  });
  if (!product) {
    log(`SKIP ${opts.slug} not found`);
    return;
  }

  const axisOrder = opts.axisOrder ?? computeAxisOrder(opts.pool);
  log(`\n=== REBUILD ${opts.slug} DO ${opts.wooId} variants=${opts.pool.length} axes=[${axisOrder.join(", ")}] ===`);

  await syncProductCopy(opts.slug, opts.wooId, opts.doP);

  const usedSkus = new Set<string>();
  for (const doVar of opts.pool) {
    const sku = opts.skuForDo(doVar);
    if (!sku) {
      log(`  SKIP DO ${doVar.id} — no LS SKU`);
      continue;
    }
    if (usedSkus.has(sku)) {
      log(`  SKIP duplicate SKU ${sku}`);
      continue;
    }
    usedSkus.add(sku);
    await upsertVariantFromDo({
      productId: product.id,
      slug: opts.slug,
      sku,
      doVar,
      axisOrder,
      skipPrice: opts.skipPriceSkus?.has(sku),
      attachments: opts.attachments,
      doP: opts.doP,
    });
  }

  if (opts.deactivateUnmatched !== false) {
    for (const v of product.variants) {
      if (!usedSkus.has(v.sku) && !(opts.keepSkus?.has(v.sku))) {
        await deactivateVariant(v.id, v.sku);
      }
    }
  }
}

async function fixAttrsForProduct(
  slug: string,
  wooId: number,
  pool: DoVar[],
  skuDecisions: Map<string, DecisionRow>,
  attachments: Map<string, string>,
  doP: Record<string, string>,
  forceAxis?: string[]
) {
  const product = await prisma.product.findFirst({
    where: { slug },
    include: {
      variants: {
        where: { status: "ACTIVE" },
        include: { attributeValues: { include: { attributeValue: { include: { attribute: true } } } } },
      },
    },
  });
  if (!product || !pool.length) return;

  const axisOrder = forceAxis ?? computeAxisOrder(pool);
  log(`\n=== FIX ATTRS ${slug} axes=[${axisOrder.join(", ")}] ===`);

  if (APPLY) {
    await prisma.product.update({ where: { id: product.id }, data: { variantAxisOrder: axisOrder } });
  }

  for (const v of product.variants) {
    const dec = skuDecisions.get(v.sku);
    const decStr = dec?.decision || "";

    if (isNewVariant(decStr)) {
      log(`  KEEP-NEW ${v.sku} (no DO price pull)`);
      continue;
    }

    if (shouldInactivate(decStr)) {
      await deactivateVariant(v.id, v.sku);
      continue;
    }

    let tokens: string[] = [];
    if (slug === "plain-yoga-mats" || slug === "7-chakras-yoga-mats" || slug === "yoga-mats-lotus") {
      tokens = decodeYogaMatSku(v.sku);
    } else if (slug === "etched-handmade-singing-bowls") {
      tokens = decodeEtchedSku(v.sku);
    } else {
      tokens = v.attributeValues.map((a) => a.attributeValue.value);
    }

    // alias decisions
    if (decStr.toLowerCase().includes("same as dark grey")) tokens = ["Dark Grey"];
    if (decStr.toLowerCase().includes("same as light grey")) tokens = ["Light Grey", "Grey"];
    if (decStr.toLowerCase().includes("same as rouge")) tokens = ["Rouge Pink"];
    if (decStr.toLowerCase().includes("same as all3")) tokens = ["Set of 3"];
    if (decStr.toLowerCase().includes("same as big")) tokens = ["Large"];

    let doVar = matchDoVar(pool, tokens);
    if (!doVar && dec?.doVariantName) {
      doVar = matchDoVar(pool, dec.doVariantName.split("/").map((s) => s.trim()));
    }

    if (!doVar) {
      log(`  MISS ${v.sku} tokens=[${tokens.join(", ")}]`);
      continue;
    }

    const skipPrice = isSkipPrice(decStr);
    await upsertVariantFromDo({
      productId: product.id,
      slug,
      sku: v.sku,
      doVar,
      axisOrder,
      skipPrice,
      attachments,
      doP,
    });
  }
}

async function handleDottedSingingBowl(pool: DoVar[], attachments: Map<string, string>, doP: Record<string, string>) {
  const slug = "dotted-singing-bowl";
  const skuMap: Record<string, string> = {
    "4 in": "MI-SB-DT-4",
    "5.5 in": "MI-SB-DT-5.5",
    "7 in": "MI-SB-DT-7",
    "Deep 5.5 Inch": "MI-SB-DT-DP-5.5",
  };

  await rebuildFromDo({
    slug,
    wooId: 6892,
    pool,
    axisOrder: ["size"],
    attachments,
    doP,
    skuForDo: (dv) => skuMap[dv.attrs.size || ""] || null,
  });
}

async function handleSilkCushion(pool: DoVar[], attachments: Map<string, string>, doP: Record<string, string>) {
  const slug = "singing-bowls-silk-ring-cushion-accessories";
  const product = await prisma.product.findFirst({
    where: { slug },
    include: { variants: { where: { status: "ACTIVE" }, include: { attributeValues: { include: { attributeValue: true } } } } },
  });
  if (!product) return;

  const lsByTokens = new Map<string, string>();
  for (const v of product.variants) {
    const raw = v.attributeValues.map((a) => a.attributeValue.value).join("|");
    lsByTokens.set(norm(raw), v.sku);
    // try split combined values
    for (const av of v.attributeValues) {
      const val = av.attributeValue.value;
      const parts = val.split(/\s*\/\s*/);
      if (parts.length === 2) lsByTokens.set(norm(`${parts[0]}|${parts[1]}`), v.sku);
    }
  }

  await rebuildFromDo({
    slug,
    wooId: 6988,
    pool,
    axisOrder: ["size", "colour"],
    attachments,
    doP,
    skuForDo: (dv) => {
      const colour = dv.attrs.colour || "";
      const size = dv.attrs.size || "";
      const fuzzy = fuzzyLsSkuForDo(dv, lsByTokens, slug);
      if (fuzzy) return fuzzy;
      const key = norm(`${colour}|${size}`);
      for (const [k, sku] of lsByTokens) if (tokenMatch(k, key)) return sku;
      return dv.sku || null;
    },
  });
}

async function handleEtchedHandmade(pool: DoVar[], attachments: Map<string, string>, doP: Record<string, string>) {
  const product = await prisma.product.findFirst({
    where: { slug: "etched-handmade-singing-bowls" },
    include: { variants: { where: { status: "ACTIVE" } } },
  });
  const lsSkus = new Set(product?.variants.map((v) => v.sku) || []);

  await rebuildFromDo({
    slug: "etched-handmade-singing-bowls",
    wooId: 9795,
    pool,
    axisOrder: ["type", "size"],
    attachments,
    doP,
    skuForDo: (dv) => {
      const type = dv.attrs.type || "";
      const size = dv.attrs.size || "";
      const code = Object.entries(ETCHED_TYPE).find(([, v]) => tokenMatch(v, type))?.[0];
      const num = size.match(/([\d.]+)/)?.[1];
      if (!code || !num) return null;
      const candidate = `MI-SB-HM-ET-${code}-${num}`;
      if (lsSkus.has(candidate)) return candidate;
      for (const sku of lsSkus) {
        const decoded = decodeEtchedSku(sku);
        if (decoded.length === 2 && tokenMatch(decoded[0], type) && tokenMatch(decoded[1], size)) return sku;
      }
      return null;
    },
  });
}

async function handleMantraBowls(pool: DoVar[], attachments: Map<string, string>, doP: Record<string, string>) {
  const keep7 = new Set<string>();
  const product = await prisma.product.findFirst({
    where: { slug: "singing-bowls-with-sacred-mantra-printed" },
    include: { variants: { where: { status: "ACTIVE" } } },
  });
  for (const v of product?.variants || []) {
    if (v.sku.includes("-7") || v.sku.endsWith("-3.5")) keep7.add(v.sku);
  }

  await rebuildFromDo({
    slug: "singing-bowls-with-sacred-mantra-printed",
    wooId: 6807,
    pool,
    axisOrder: ["color", "size"],
    attachments,
    doP,
    keepSkus: keep7,
    skuForDo: (dv) => {
      if ((dv.attrs.size || "").includes("7")) return null;
      const color = (dv.attrs.color || "").charAt(0).toUpperCase();
      const sz = dv.attrs.size?.match(/([\d.]+)/)?.[1];
      const map: Record<string, string> = { Gold: "GO", Blue: "B", Green: "G", Red: "R", Black: "BK" };
      const c = map[dv.attrs.color || ""] || color;
      if (!sz || !c) return null;
      const candidate = `MI-SB-SM-${c}-${sz}`;
      return candidate;
    },
  });
}

async function handleTingsha(pool: DoVar[], attachments: Map<string, string>, doP: Record<string, string>) {
  const product = await prisma.product.findFirst({
    where: { slug: "tingsha-bell" },
    include: { variants: { where: { status: "ACTIVE" } } },
  });
  const keepMedium = new Set(product?.variants.filter((v) => /-M$/i.test(v.sku)).map((v) => v.sku) || []);

  await rebuildFromDo({
    slug: "tingsha-bell",
    wooId: 5763,
    pool,
    axisOrder: ["type", "size"],
    attachments,
    doP,
    keepSkus: keepMedium,
    skipPriceSkus: keepMedium,
    skuForDo: (dv) => {
      const type = dv.attrs.type || "";
      const size = dv.attrs.size || "";
      const typeCode = { Golden: "P", Dark: "D", Etched: "ET" }[type] || type.slice(0, 2).toUpperCase();
      const sizeCode = size === "Small" ? "S" : size === "Standard" ? "M" : size.charAt(0);
      const candidate = `MI-TB-${typeCode}-${sizeCode}`;
      return candidate;
    },
  });
}

async function handleCrescentZafuWide(pool: DoVar[], attachments: Map<string, string>, doP: Record<string, string>) {
  await rebuildFromDo({
    slug: "crescent-zafu-cushion-wide-cotton",
    wooId: 47494,
    pool: pool.filter((v) => v.attrs.colour),
    axisOrder: ["colour"],
    attachments,
    doP,
    skuForDo: (dv) => {
      const c = dv.attrs.colour || "";
      const map: Record<string, string> = {
        "Rouge Pink": "ME-CZ-W-RP",
        "Misty Blue": "ME-CZ-W-MB",
        Lavender: "ME-CZ-W-LV",
      };
      return map[c] || null;
    },
  });
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const catalog = loadCatalog();
  const allDecisions = JSON.parse(fs.readFileSync(DECISIONS, "utf8")) as DecisionRow[];
  const decisionsBySku = new Map(allDecisions.map((r) => [r.lsSku, r]));

  log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  // --- Product-specific rebuilds ---
  const dottedPool = catalog.byParent.get("6892") || [];
  await handleDottedSingingBowl(dottedPool, catalog.attachments, catalog.products.get("6892")!);

  const silkPool = catalog.byParent.get("6988") || [];
  await handleSilkCushion(silkPool, catalog.attachments, catalog.products.get("6988")!);

  const etchedPool = catalog.byParent.get("9795") || [];
  await handleEtchedHandmade(etchedPool, catalog.attachments, catalog.products.get("9795")!);

  const mantraPool = catalog.byParent.get("6807") || [];
  await handleMantraBowls(mantraPool, catalog.attachments, catalog.products.get("6807")!);

  const tingshaPool = catalog.byParent.get("5763") || [];
  await handleTingsha(tingshaPool, catalog.attachments, catalog.products.get("5763")!);

  const zafuPool = catalog.byParent.get("47494") || [];
  await handleCrescentZafuWide(zafuPool, catalog.attachments, catalog.products.get("47494")!);

  // --- Attribute fix pass for all 41 variable products ---
  for (const slug of ALL_41_SLUGS) {
    if ([
      "dotted-singing-bowl",
      "singing-bowls-silk-ring-cushion-accessories",
      "etched-handmade-singing-bowls",
      "singing-bowls-with-sacred-mantra-printed",
      "tingsha-bell",
      "crescent-zafu-cushion-wide-cotton",
    ].includes(slug)) continue;

    const product = await prisma.product.findFirst({ where: { slug }, select: { wooCommerceId: true, productType: true } });
    if (!product || product.productType === "SIMPLE") continue;
    const wooId = String(WOO_OVERRIDES[slug] ?? product.wooCommerceId ?? "");
    const pool = catalog.byParent.get(wooId) || [];
    if (!pool.length) continue;
    const doP = catalog.products.get(wooId) || {};
    const forceAxis =
      slug === "plain-yoga-mats" || slug === "7-chakras-yoga-mats" || slug === "yoga-mats-lotus"
        ? ["color", "grip"]
        : undefined;
    await fixAttrsForProduct(slug, Number(wooId), pool, decisionsBySku, catalog.attachments, doP, forceAxis);
  }

  if (APPLY) {
    log("\n=== Gallery pass for rebuilt products ===");
    for (const slug of [
      "dotted-singing-bowl",
      "singing-bowls-silk-ring-cushion-accessories",
      "etched-handmade-singing-bowls",
      "plain-yoga-mats",
      "crescent-zafu-cushion-wide-cotton",
    ]) {
      try {
        execSync(`npx tsx scripts/sync-do-variant-galleries.ts --apply --product-slug ${slug}`, {
          cwd: path.resolve(__dirname, ".."),
          stdio: "pipe",
        });
        log(`  carousel OK: ${slug}`);
      } catch (e) {
        log(`  carousel warn ${slug}`);
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(BACKUP_DIR, `${stamp}-actions.json`), JSON.stringify({ actions }, null, 2));
  log(`\nDone. Log: ${BACKUP_DIR}/${stamp}-actions.json`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
