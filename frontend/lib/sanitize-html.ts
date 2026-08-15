const CURRENT_WHATSAPP_DISPLAY = "+91 96113 61100";
const CURRENT_WHATSAPP_DIGITS = "919611361100";

/** Retired Woo copy still has the old support mobile in shipping accordion HTML. */
export function replaceRetiredSupportPhone(text: string): string {
  return text
    .replace(/wa\.me\/(?:91)?9535975075/gi, `wa.me/${CURRENT_WHATSAPP_DIGITS}`)
    .replace(/api\.whatsapp\.com\/send\?phone=(?:91)?9535975075/gi, `api.whatsapp.com/send?phone=${CURRENT_WHATSAPP_DIGITS}`)
    .replace(/tel:\+?(?:91)?9535975075/gi, `tel:+${CURRENT_WHATSAPP_DIGITS}`)
    .replace(/\+91[\s\u00a0\-]*95359[\s\u00a0\-]*75075/g, CURRENT_WHATSAPP_DISPLAY)
    .replace(/919535975075/g, CURRENT_WHATSAPP_DIGITS)
    .replace(/9535975075/g, "9611361100");
}

/** Woo/CSV sometimes stores literal backslash-n instead of line breaks. */
export function normalizeProductText(text: string): string {
  return replaceRetiredSupportPhone(
    text
      // CR + literal `\n` from Woo dumps (`\r\\n`) must be one break, not two.
      .replace(/\r\\n/g, "\n")
      .replace(/\\r\\n/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
  );
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

/** Drop empty Woo paragraphs that inflate PDP spacing. */
export function stripEmptyHtmlParagraphs(html: string): string {
  return html
    .replace(/<p[^>]*>\s*(?:&nbsp;|\u00a0|<br\s*\/?>|\s)*<\/p>/gi, "")
    .replace(/(<br\s*\/?>\s*){2,}/gi, "<br />")
    .trim();
}

function wrapFirstSentence(inner: string): string {
  if (/<strong[\s>]/i.test(inner)) return inner;
  let inTag = false;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "<") inTag = true;
    else if (ch === ">") inTag = false;
    else if (!inTag && (ch === "." || ch === "!" || ch === "?")) {
      const next = inner[i + 1];
      if (next === undefined || /\s/.test(next) || next === "<") {
        return `<strong>${inner.slice(0, i + 1)}</strong>${inner.slice(i + 1)}`;
      }
    }
  }
  return inner;
}

/** Bold the lead sentence of each paragraph so long PDP copy is easier to scan. */
export function emphasizeDescriptionParagraphs(html: string): string {
  return stripEmptyHtmlParagraphs(html).replace(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/gi, (_full, attrs = "", inner: string) => {
    return `<p${attrs}>${wrapFirstSentence(inner)}</p>`;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function descriptionParagraphs(text: string): string[] {
  return normalizeProductText(text)
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function emphasizePlainParagraph(text: string): string {
  const escaped = escapeHtml(text);
  const match = escaped.match(/^(.+?[.!?])(\s+[\s\S]*)?$/);
  if (!match) return `<strong>${escaped}</strong>`;
  return `<strong>${match[1]}</strong>${match[2] ?? ""}`;
}
