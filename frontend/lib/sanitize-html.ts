/** Woo/CSV sometimes stores literal backslash-n instead of line breaks. */
export function normalizeProductText(text: string): string {
  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
}

/** Strip editor metadata and render-safe HTML for product copy. */
export function sanitizeProductHtml(html: string): string {
  return normalizeProductText(html)
    .replace(/\sdata-[a-z-]+="[^"]*"/gi, "")
    .replace(/\sdata-[a-z-]+='[^']*'/gi, "")
    .trim();
}

export function htmlToPlainText(html: string): string {
  return sanitizeProductHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value.trim());
}
