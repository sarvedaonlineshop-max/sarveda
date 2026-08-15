/**
 * Pull Woo product_audio_N clips onto LS variants (by size/type/color title).
 * Mirrors missing mp3s to S3. Does not rename SKUs.
 *
 * Usage (Lightsail):
 *   npx tsx scripts/sync-do-variant-audio.ts
 *   npx tsx scripts/sync-do-variant-audio.ts --apply
 *   npx tsx scripts/sync-do-variant-audio.ts --apply --product-slug handmade-singing-bowls-all-sizes
 */
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { PrismaClient } from "@prisma/client";

import { getPublicMediaUrl, mirrorUrlToS3 } from "../src/config/s3";
import { loadAttachmentMapFromWxr } from "./wxr-attachments";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY = process.argv.includes("--apply");
const slugFlag = process.argv.findIndex((a) => a === "--product-slug");
const ONLY_SLUG = slugFlag >= 0 ? process.argv[slugFlag + 1] : null;

const prisma = new PrismaClient();
const REPO_ROOT = path.resolve(__dirname, "../..");
const CSV_PATH = path.resolve(__dirname, "../prisma/wc-products.csv");
const ATT_CSV = path.resolve(REPO_ROOT, "data/compare/do_attachments.csv");

type Clip = { title: string; attachmentId: number; wpUrl: string };

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "").trim();
}

function loadAttachmentMap(): Map<number, string> {
  const map = loadAttachmentMapFromWxr(REPO_ROOT);
  if (fs.existsSync(ATT_CSV)) {
    const raw = fs.readFileSync(ATT_CSV, "utf-8");
    const rows = parse(raw, { columns: true, skip_empty_lines: true, bom: true }) as Array<
      Record<string, string>
    >;
    for (const row of rows) {
      const id = parseInt(String(row.id || "").trim(), 10);
      const url = (row.url || row.guid || "").trim();
      if (Number.isFinite(id) && url.startsWith("http") && !map.has(id)) {
        map.set(id, url);
      }
    }
  }
  return map;
}

function loadWooClips(attachments: Map<number, string>): Map<number, { name: string; clips: Clip[] }> {
  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(raw, { relax_column_count: true, skip_empty_lines: true, bom: true }) as string[][];
  const header = rows[0].map((h) => stripBom(h));
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    if (!(h in idx)) idx[h] = i;
  });

  const out = new Map<number, { name: string; clips: Clip[] }>();
  for (const row of rows.slice(1)) {
    const type = (row[idx["Type"]] ?? "").trim().toLowerCase();
    if (type !== "variable" && type !== "simple") continue;
    const wooId = parseInt(row[idx["ID"]] ?? "", 10);
    if (!Number.isFinite(wooId)) continue;
    const name = (row[idx["Name"]] ?? "").trim();
    const clips: Clip[] = [];
    for (let i = 0; i < 16; i++) {
      const title = (row[idx[`Meta: product_audio_${i}_title`]] ?? "").trim();
      const audioRaw = (row[idx[`Meta: product_audio_${i}_audio`]] ?? "").trim();
      if (!audioRaw) continue;
      let wpUrl = "";
      let attachmentId = 0;
      if (audioRaw.startsWith("http")) {
        wpUrl = audioRaw;
      } else if (/^\d+$/.test(audioRaw)) {
        attachmentId = parseInt(audioRaw, 10);
        wpUrl = attachments.get(attachmentId) || "";
      }
      if (!wpUrl) continue;
      clips.push({ title, attachmentId, wpUrl });
    }
    const simple = (row[idx["Meta: simple_product_0_audio"]] ?? "").trim();
    if (!clips.length && simple) {
      let wpUrl = "";
      let attachmentId = 0;
      if (simple.startsWith("http")) wpUrl = simple;
      else if (/^\d+$/.test(simple)) {
        attachmentId = parseInt(simple, 10);
        wpUrl = attachments.get(attachmentId) || "";
      }
      if (wpUrl) clips.push({ title: "", attachmentId, wpUrl });
    }
    if (clips.length) out.set(wooId, { name, clips });
  }
  return out;
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/inched/g, "in")
    .replace(/inches\b/g, "in")
    .replace(/inch\b/g, "in")
    .replace(/centimet(?:re|er)s?\b/g, "cm")
    .replace(/cms\b/g, "cm")
    .replace(/\bbars\b/g, "bar")
    .replace(/\bkeys\b/g, "key")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sizeNumber(value: string): string | null {
  const n = norm(value);
  const m = n.match(/(\d+(?:\.\d+)?)\s*(?:in|cm)\b/);
  if (m) return m[1]!;
  const bare = n.match(/^(\d+(?:\.\d+)?)$/);
  return bare ? bare[1]! : null;
}

function clipLabel(clip: Clip): string {
  const title = clip.title.trim();
  const generic = !title || /^(audio|sound|sample)$/i.test(title);
  const base = path
    .basename(clip.wpUrl)
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ");
  return generic ? base : title;
}

function variantBlob(attrs: Record<string, string>, sku: string): string {
  return norm([sku, ...Object.values(attrs)].join(" "));
}

function scoreClip(title: string, attrs: Record<string, string>, sku: string): number {
  const t = norm(title);
  if (!t) return 0;
  const values = Object.values(attrs).map((v) => norm(v)).filter(Boolean);
  let best = 0;
  for (const v of values) {
    if (t === v) best = Math.max(best, 100);
    else if (v.length >= 3 && (t.includes(v) || v.includes(t))) best = Math.max(best, 70);
  }
  const titleSize = sizeNumber(title);
  if (titleSize) {
    for (const v of values) {
      if (sizeNumber(v) === titleSize) best = Math.max(best, 90);
    }
    // Size-titled clips must match the size number — "in" is on every bowl variant.
    return best >= 90 ? best : 0;
  }
  const nums = t.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length === 1) {
    for (const v of values) {
      const vnums = v.match(/\d+(?:\.\d+)?/g) || [];
      if (vnums.includes(nums[0]!)) best = Math.max(best, 80);
    }
  }
  const blob = variantBlob(attrs, sku);
  const stop = new Set(["the", "and", "for", "with", "in", "cm", "mm", "audio", "sound"]);
  const tokens = t.split(" ").filter((w) => w.length > 1 && !stop.has(w));
  if (tokens.length && tokens.every((tok) => blob.includes(tok))) {
    best = Math.max(best, 55);
  }
  return best;
}

function keyForWpUpload(url: string): string | null {
  const markers = ["/wp-content/uploads/", "/uploads/"];
  for (const marker of markers) {
    const i = url.indexOf(marker);
    if (i >= 0) {
      const rest = url.slice(i + marker.length).split("?")[0]!;
      return `media/wp/uploads/${decodeURIComponent(rest)}`;
    }
  }
  return null;
}

async function urlIsPublic(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureS3Audio(wpUrl: string): Promise<string> {
  const key = keyForWpUpload(wpUrl);
  if (!key) return wpUrl;
  const s3Url = getPublicMediaUrl(key);
  if (await urlIsPublic(s3Url)) return s3Url;
  if (!APPLY) return s3Url;
  const uploaded = await mirrorUrlToS3(wpUrl, key);
  return uploaded || s3Url;
}

function attrMap(
  rows: Array<{
    attributeValue: { value: string; attribute: { slug: string } };
  }>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    out[r.attributeValue.attribute.slug] = r.attributeValue.value.trim();
  }
  return out;
}

async function main(): Promise<void> {
  const attachments = loadAttachmentMap();
  const woo = loadWooClips(attachments);
  console.log(APPLY ? "APPLY\n" : "DRY-RUN\n");
  console.log(`Woo products with audio clips: ${woo.size}; attachments: ${attachments.size}`);

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(ONLY_SLUG ? { slug: ONLY_SLUG } : {}),
    },
    include: {
      variants: {
        where: { status: "ACTIVE" },
        include: {
          attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
        },
      },
    },
    orderBy: { slug: "asc" },
  });

  let assigned = 0;
  let mirrored = 0;
  let unmatchedClips = 0;
  let productsTouched = 0;

  for (const p of products) {
    if (p.wooCommerceId == null || !woo.has(p.wooCommerceId)) continue;
    const { clips } = woo.get(p.wooCommerceId)!;
    if (clips.length < 1) continue;

    const resolved: Array<Clip & { s3Url: string }> = [];
    for (const clip of clips) {
      const s3Url = await ensureS3Audio(clip.wpUrl);
      if (s3Url !== clip.wpUrl && s3Url.includes("sarveda-media")) mirrored++;
      resolved.push({ ...clip, s3Url });
    }

    const desired = new Map<string, { url: string; title: string }>();
    const usedClipUrls = new Set<string>();
    for (const v of p.variants) {
      const attrs = attrMap(v.attributeValues);
      let best: { score: number; url: string; title: string } | null = null;
      for (const clip of resolved) {
        const label = clipLabel(clip);
        const score = scoreClip(label, attrs, v.sku);
        if (score < 55) continue;
        if (!best || score > best.score) best = { score, url: clip.s3Url, title: label };
      }
      if (best) {
        desired.set(v.id, best);
        usedClipUrls.add(best.url);
      }
    }

    const unusedClips = resolved.filter((c) => !usedClipUrls.has(c.s3Url));
    const unusedVars = p.variants.filter((v) => !desired.has(v.id));
    if (unusedClips.length === 1 && unusedVars.length === 1) {
      const clip = unusedClips[0]!;
      desired.set(unusedVars[0]!.id, { url: clip.s3Url, title: clipLabel(clip) || "leftover" });
    } else if (resolved.length === 1) {
      for (const v of unusedVars) {
        desired.set(v.id, { url: resolved[0]!.s3Url, title: clipLabel(resolved[0]!) || "product" });
      }
    } else if (p.audioUrl) {
      for (const v of unusedVars) {
        desired.set(v.id, { url: p.audioUrl, title: "product-fallback" });
      }
    }

    const updates: Array<{ sku: string; from: string | null; to: string; title: string }> = [];
    for (const v of p.variants) {
      const next = desired.get(v.id);
      if (!next) continue;
      if ((v.audioUrl || "") === next.url) continue;
      updates.push({ sku: v.sku, from: v.audioUrl, to: next.url, title: next.title });
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { audioUrl: next.url },
        });
      }
      assigned++;
    }

    if (resolved.length > 1) {
      unmatchedClips += resolved.filter((c) => ![...desired.values()].some((d) => d.url === c.s3Url)).length;
    }

    if (updates.length) {
      productsTouched++;
      console.log(`${p.slug}  ${updates.length} variant(s)`);
      for (const u of updates) {
        console.log(`  ${u.sku}  [${u.title}]  ${u.to.split("/").pop()}`);
      }
    }

    if (!p.hasAudio || !p.audioUrl) {
      const first = resolved[0]!;
      if (APPLY) {
        await prisma.product.update({
          where: { id: p.id },
          data: { hasAudio: true, audioUrl: first.s3Url },
        });
      }
    }
  }

  // Products with a product-level sample but no Woo clip map: copy onto empty variants.
  for (const p of products) {
    if (!p.audioUrl) continue;
    const empty = p.variants.filter((v) => !v.audioUrl);
    if (!empty.length) continue;
    if (p.wooCommerceId != null && woo.has(p.wooCommerceId)) continue;
    productsTouched++;
    console.log(`${p.slug}  ${empty.length} variant(s) product-fallback`);
    for (const v of empty) {
      console.log(`  ${v.sku}  [product-fallback]  ${p.audioUrl.split("/").pop()}`);
      if (APPLY) {
        await prisma.productVariant.update({
          where: { id: v.id },
          data: { audioUrl: p.audioUrl },
        });
      }
      assigned++;
    }
  }

  console.log(
    `\n${APPLY ? "Updated" : "Would update"} ${assigned} variants across ${productsTouched} products` +
      `; unmatched extra clips: ${unmatchedClips}; S3 mirrors attempted: ${mirrored}`
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
