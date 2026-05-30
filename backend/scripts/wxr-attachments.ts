/**
 * Build attachment ID → URL map from one or more WordPress WXR exports.
 */
import fs from "fs";

import { may30 } from "./migration-paths";
import { readWxr } from "./wxr-utils";

function defaultXmlPaths(): string[] {
  return [may30.media(), may30.products(), may30.variations()];
}

function parseAttachmentBlocks(xml: string): Map<number, string> {
  const map = new Map<number, string>();
  const blocks = xml.split(/\s*<item>/).slice(1);

  for (const block of blocks) {
    if (!block.includes("<wp:post_type><![CDATA[attachment]]>")) continue;

    const idMatch =
      block.match(/<wp:post_id>(\d+)<\/wp:post_id>/) ??
      block.match(/<wp:post_id><!\[CDATA\[(\d+)\]\]><\/wp:post_id>/);
    if (!idMatch) continue;

    const urlMatch =
      block.match(/<wp:attachment_url><!\[CDATA\[([^\]]+)\]\]><\/wp:attachment_url>/) ??
      block.match(/<guid isPermaLink="false">([^<]+)<\/guid>/);
    if (!urlMatch) continue;

    const url = urlMatch[1].trim();
    if (url.startsWith("http")) map.set(parseInt(idMatch[1], 10), url);
  }

  return map;
}

/** Merge attachment maps; later files do not override earlier IDs. */
export function loadAttachmentMapFromWxr(
  repoRoot: string,
  extraPaths: string[] = []
): Map<number, string> {
  const map = new Map<number, string>();
  const relPaths = [...extraPaths, ...defaultXmlPaths()];

  for (const rel of relPaths) {
    const abs = rel.startsWith("/") ? rel : `${repoRoot}/${rel}`;
    if (!fs.existsSync(abs)) continue;

    const xml = readWxr(abs);
    const chunk = parseAttachmentBlocks(xml);
    for (const [id, url] of chunk) {
      if (!map.has(id)) map.set(id, url);
    }
  }

  return map;
}
