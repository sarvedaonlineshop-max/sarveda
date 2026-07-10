/** Woo/CSV sometimes stores literal backslash-n instead of line breaks. */
export function normalizeProductText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
}

/** Strip editor metadata and render-safe HTML for product copy.
 *  Also repairs double-escaped entities from the Woo import (`&amp;nbsp;` → `&nbsp;`). */
export function sanitizeProductHtml(html: string): string {
  return normalizeProductText(html)
    .replace(/\sdata-[a-z-]+="[^"]*"/gi, "")
    .replace(/\sdata-[a-z-]+='[^']*'/gi, "")
    .replace(/&amp;((?:[a-z]+|#\d+|#x[0-9a-f]+));/gi, "&$1;")
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  deg: "°",
  times: "×",
  copy: "©",
  reg: "®",
  trade: "™"
};

/** Decode HTML entities for plain-text rendering (never for dangerouslySetInnerHTML paths).
 *  Runs up to 3 passes so double-escaped Woo content (`&amp;nbsp;`) fully resolves. */
export function decodeHtmlEntities(text: string): string {
  let out = text;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = out
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
    if (next === out) break;
    out = next;
  }
  return out;
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    sanitizeProductHtml(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
  ).trim();
}

export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value.trim());
}
