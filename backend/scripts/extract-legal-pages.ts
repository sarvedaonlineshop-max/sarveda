/**
 * One-off: extract policy page HTML from WordPress pages export → frontend/lib/legal-pages.json
 * Run: cd backend && npx ts-node scripts/extract-legal-pages.ts
 */
import fs from "fs";
import path from "path";

const XML_PATH = path.resolve(__dirname, "../../data/May-30/sarveda.WordPress.2026-05-30-pages.xml");
const OUT_PATH = path.resolve(__dirname, "../../frontend/lib/legal-pages.json");

const SLUGS: Record<string, { title: string; key: string }> = {
  "privacy-policy": { title: "Privacy and Cookies Policy", key: "privacy" },
  "terms-of-use": { title: "Terms of Use", key: "terms" },
  "cancellation-and-returns": { title: "Returns, Replacements & Refund Policy", key: "refunds" },
  "shipping-and-delivery-policy": { title: "Shipping Policy", key: "shipping" }
};

function rewriteLinks(html: string): string {
  return html
    .replace(/https?:\/\/sarveda\.com\/privacy-policy\/?/gi, "/privacy")
    .replace(/\/\/sarveda\.com\/privacy-policy\/?/gi, "/privacy")
    .replace(/https?:\/\/sarveda\.com\/terms-of-use\/?/gi, "/terms")
    .replace(/\/\/sarveda\.com\/terms-of-use\/?/gi, "/terms")
    .replace(/https?:\/\/sarveda\.com\/cancellation-and-returns\/?/gi, "/refunds")
    .replace(/https?:\/\/sarveda\.com\/shipping-and-delivery-policy\/?/gi, "/shipping")
    .replace(/https?:\/\/sarveda\.com\/?/gi, "/")
    .replace(/<span style="color: #e87e04;">/gi, "")
    .replace(/<\/span>/gi, "")
    .replace(/⸻/g, "<hr />")
    .replace(/Join Our Email List[\s\S]*$/i, "")
    .trim();
}

function extractPage(xml: string, slug: string): string | null {
  const items = xml.split("<item>");
  for (const item of items) {
    if (!item.includes(`<wp:post_name><![CDATA[${slug}]]></wp:post_name>`)) continue;
    const match = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
    if (!match?.[1]) return null;
    return rewriteLinks(match[1]);
  }
  return null;
}

function main() {
  const xml = fs.readFileSync(XML_PATH, "utf8");
  const pages: Record<string, { title: string; html: string }> = {};

  for (const [slug, meta] of Object.entries(SLUGS)) {
    const html = extractPage(xml, slug);
    if (!html) {
      console.error(`Missing page: ${slug}`);
      process.exit(1);
    }
    pages[meta.key] = { title: meta.title, html };
    console.log(`✓ ${meta.key} (${slug}) — ${html.length} chars`);
  }

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(pages, null, 2)}\n`);
  console.log(`Wrote ${OUT_PATH}`);
}

main();
