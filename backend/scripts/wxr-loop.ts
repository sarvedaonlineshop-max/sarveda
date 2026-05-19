import {
  buildAttachmentMap,
  cdata,
  parseIntSafe,
  parseItems,
  parseMeta,
  readWxr
} from "./wxr-utils";

export type WxrItem = {
  block: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  meta: Record<string, string>;
  wpPostId: number;
  attachments: Map<string, string>;
};

export function loadPublishedItems(xmlPath: string, postType: string): WxrItem[] {
  const xml = readWxr(xmlPath);
  const items = parseItems(xml);
  const attachments = buildAttachmentMap(items);
  const out: WxrItem[] = [];

  for (const block of items) {
    if (!block.includes(`<wp:post_type><![CDATA[${postType}]]></wp:post_type>`)) continue;
    if (!block.includes("<wp:status><![CDATA[publish]]></wp:status>")) continue;

    const slug = cdata("wp:post_name", block);
    if (!slug) continue;

    out.push({
      block,
      slug,
      title: cdata("title", block),
      content: cdata("content:encoded", block),
      excerpt: cdata("excerpt:encoded", block),
      meta: parseMeta(block),
      wpPostId: parseIntSafe(cdata("wp:post_id", block)),
      attachments
    });
  }
  return out;
}

export function thumbUrl(item: WxrItem): string | null {
  const id = item.meta._thumbnail_id;
  return id ? item.attachments.get(id) ?? null : null;
}
