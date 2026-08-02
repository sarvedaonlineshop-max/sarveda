/** SKU family prefix from General step (Others = no parent segment). */
export type SkuFamilyCode = "MI" | "YO" | "ME" | "OTHER";

export const SKU_FAMILY_OPTIONS: { value: SkuFamilyCode; label: string }[] = [
  { value: "MI", label: "Music Instruments (MI)" },
  { value: "YO", label: "Yoga Product (YO)" },
  { value: "ME", label: "Meditation Product (ME)" },
  { value: "OTHER", label: "Others" }
];

const STOP = new Set(["a", "an", "the", "of", "and", "for", "to", "in", "on", "with"]);

function alnumUpper(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Product segment: "Yoga mats" → YM; single word → first 2 letters. */
export function productNameCode(productName: string, letterCount = 0): string {
  const words = productName
    .trim()
    .split(/\s+/)
    .map((w) => alnumUpper(w))
    .filter((w) => w.length > 0 && !STOP.has(w.toLowerCase()));

  if (words.length === 0) return "XX";

  if (words.length === 1) {
    const w = words[0]!;
    const n = letterCount > 0 ? Math.min(4, Math.max(2, letterCount)) : 2;
    return (w + "X").slice(0, n);
  }

  const initials = words.map((w) => w[0]!).join("");
  if (letterCount <= 0 || letterCount <= initials.length) {
    return initials.slice(0, Math.max(2, Math.min(4, initials.length)));
  }
  // Expand: keep initials, pad from last word
  let out = initials;
  const last = words[words.length - 1]!;
  for (let i = 1; out.length < letterCount && i < last.length; i++) {
    out += last[i]!;
  }
  return out.slice(0, Math.min(6, letterCount));
}

export function attributeValueCode(value: string, len: number): string {
  const c = alnumUpper(value.trim());
  const n = Math.max(1, Math.min(3, len));
  if (!c) return "X".repeat(n);
  if (c.length >= n) return c.slice(0, n);
  return (c + "X".repeat(n)).slice(0, n);
}

export type SkuVariantInput = {
  /** Attribute values in axis order (Size, Color, …). Empty for simple. */
  attributeValues: string[];
};

function buildOneSku(
  family: SkuFamilyCode | "",
  productCode: string,
  attributeValues: string[],
  lens: number[]
): string {
  const parts: string[] = [];
  if (family && family !== "OTHER") parts.push(family);
  parts.push(productCode);
  for (let i = 0; i < attributeValues.length; i++) {
    const val = attributeValues[i]?.trim();
    if (!val) continue;
    parts.push(attributeValueCode(val, lens[i] ?? 1));
  }
  return parts.join("-").slice(0, 120);
}

function findDuplicateIndices(skus: string[]): number[][] {
  const map = new Map<string, number[]>();
  skus.forEach((s, i) => {
    const key = s.toUpperCase();
    const list = map.get(key) ?? [];
    list.push(i);
    map.set(key, list);
  });
  return Array.from(map.values()).filter((g) => g.length > 1);
}

/**
 * Expand letter lengths for the first attribute level where two clashing
 * variants differ, so Blue/Black become BL/BL → BLU/BLA.
 */
function expandLensForClash(
  variants: SkuVariantInput[],
  group: number[],
  lens: number[]
): boolean {
  const a = variants[group[0]!]!;
  for (let gi = 1; gi < group.length; gi++) {
    const b = variants[group[gi]!]!;
    const max = Math.max(a.attributeValues.length, b.attributeValues.length);
    for (let level = 0; level < max; level++) {
      const va = alnumUpper(a.attributeValues[level] ?? "");
      const vb = alnumUpper(b.attributeValues[level] ?? "");
      if (va && vb && va !== vb) {
        if ((lens[level] ?? 1) < 3) {
          lens[level] = (lens[level] ?? 1) + 1;
          return true;
        }
      }
    }
  }
  return false;
}

export type GenerateSkuOptions = {
  family: SkuFamilyCode | "";
  productName: string;
  variants: SkuVariantInput[];
  /** SKUs already taken in DB (uppercase compare). */
  takenSkus?: Iterable<string>;
  /** Max product-code letter expansion attempts. */
  maxProductExpand?: number;
};

/**
 * Build unique SKUs: [FAMILY-]PRODUCT[-ATTR…] with 1→2→3 letter attr expansion
 * on clashes, then product-code expand, then numeric suffix.
 */
export function generateUniqueSkus(opts: GenerateSkuOptions): string[] {
  const { family, productName, variants } = opts;
  const taken = new Set(
    Array.from(opts.takenSkus ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean)
  );
  const maxLevels = Math.max(0, ...variants.map((v) => v.attributeValues.length));
  const lens = Array.from({ length: maxLevels }, () => 1);
  let productLetters = 0;
  const maxProductExpand = opts.maxProductExpand ?? 4;

  const tryBuild = (): string[] => {
    const productCode = productNameCode(productName, productLetters);
    return variants.map((v) => buildOneSku(family, productCode, v.attributeValues, lens));
  };

  for (let round = 0; round < 40; round++) {
    const skus = tryBuild();
    const dupGroups = findDuplicateIndices(skus);
    const reservedClash = skus.some((s) => taken.has(s.toUpperCase()));

    if (dupGroups.length === 0 && !reservedClash) {
      return skus;
    }

    let expanded = false;
    for (const group of dupGroups) {
      if (expandLensForClash(variants, group, lens)) expanded = true;
    }

    if (!expanded && reservedClash) {
      // Expand first level that still has room, else product code
      let grewAttr = false;
      for (let i = 0; i < lens.length; i++) {
        if (lens[i]! < 3) {
          lens[i]!++;
          grewAttr = true;
          break;
        }
      }
      if (!grewAttr && productLetters < maxProductExpand) {
        productLetters = productLetters === 0 ? 3 : productLetters + 1;
        expanded = true;
      } else if (grewAttr) {
        expanded = true;
      }
    } else if (!expanded && productLetters < maxProductExpand) {
      productLetters = productLetters === 0 ? 3 : productLetters + 1;
      expanded = true;
    }

    if (!expanded) break;
  }

  // Numeric suffix for any remaining collisions
  const base = tryBuild();
  const used = new Set(taken);
  const out: string[] = [];
  for (const raw of base) {
    let sku = raw;
    let n = 2;
    while (used.has(sku.toUpperCase()) || out.some((o) => o.toUpperCase() === sku.toUpperCase())) {
      const suffix = `-${n}`;
      sku = `${raw.slice(0, Math.max(1, 120 - suffix.length))}${suffix}`;
      n++;
      if (n > 999) break;
    }
    used.add(sku.toUpperCase());
    out.push(sku);
  }
  return out;
}
