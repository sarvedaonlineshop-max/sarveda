import fs from "fs";

export type MetaMap = Record<string, string>;

export function parseItems(xml: string): string[] {
  return xml.split(/\s*<item>/).slice(1);
}

export function readWxr(path: string): string {
  if (!fs.existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return fs.readFileSync(path, "utf8");
}

export function cdata(tag: string, block: string): string {
  const m = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
  if (m) return m[1];
  const plain = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return plain?.[1]?.trim() ?? "";
}

export function parseMeta(block: string): MetaMap {
  const meta: MetaMap = {};
  const re =
    /<wp:meta_key><!\[CDATA\[([^\]]+)\]\]><\/wp:meta_key>\s*<wp:meta_value><!\[CDATA\[([\s\S]*?)\]\]><\/wp:meta_value>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    meta[m[1]] = m[2];
  }
  return meta;
}

export function parseIntSafe(v: string | undefined): number {
  if (!v?.trim()) return 0;
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export function buildAttachmentMap(items: string[]): Map<string, string> {
  const attachments = new Map<string, string>();
  for (const block of items) {
    if (!block.includes("<wp:post_type><![CDATA[attachment]]></wp:post_type>")) continue;
    const id = cdata("wp:post_id", block);
    const url = cdata("wp:attachment_url", block) || cdata("guid", block);
    if (id && url) attachments.set(id, url);
  }
  return attachments;
}

/** WordPress ACF date Ymd or ISO-ish → Date */
export function parseWpDate(raw: string | undefined, timeRaw?: string): Date | null {
  const d = (raw ?? "").trim();
  if (!d) return null;
  if (/^\d{8}$/.test(d)) {
    const y = d.slice(0, 4);
    const mo = d.slice(4, 6);
    const day = d.slice(6, 8);
    const t = (timeRaw ?? "12:00:00").trim() || "12:00:00";
    const iso = `${y}-${mo}-${day}T${t.length <= 8 ? t : "12:00:00"}`;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Prisma JSON must not contain `undefined`. */
export function toPrismaJson(value: Record<string, unknown>): object | null {
  const cleaned = JSON.parse(
    JSON.stringify(value, (_key, v) => (v === undefined ? null : v))
  ) as Record<string, unknown>;
  if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) return null;
  const hasValue = Object.values(cleaned).some((v) => v !== null && v !== "");
  return hasValue ? cleaned : null;
}

export function resolveMediaRef(
  raw: string | undefined,
  attachments: Map<string, string>
): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return attachments.get(t) ?? null;
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return null;
}

export function inferEnrollmentMode(priceInPaise: number, html: string): "CHECKOUT" | "ENQUIRY" | "BOTH" {
  const lower = html.toLowerCase();
  const hasEnquire =
    lower.includes("care@sarveda.com") ||
    lower.includes("whatsapp") ||
    lower.includes("write to us") ||
    lower.includes("write to care");
  if (priceInPaise <= 0) return "ENQUIRY";
  if (hasEnquire) return "BOTH";
  return "CHECKOUT";
}
