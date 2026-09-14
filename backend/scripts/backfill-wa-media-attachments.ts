/**
 * One-shot: mirror existing WhatsApp [image]/media body URLs into EnquiryAttachment.
 *   npx tsx scripts/backfill-wa-media-attachments.ts
 */
import path from "path";
import { randomUUID } from "crypto";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { uploadAsset } from "../src/config/s3";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const MEDIA_RE = /\[(image|video|audio|document|sticker)\]\s*([\s\S]*)/i;

async function main() {
  const rows = await prisma.enquiryMessage.findMany({
    where: {
      OR: [
        { body: { contains: "[image]" } },
        { body: { contains: "[video]" } },
        { body: { contains: "[audio]" } },
        { body: { contains: "[document]" } },
        { body: { contains: "[sticker]" } },
      ],
      attachments: { none: {} },
    },
    select: { id: true, body: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  console.log(`Candidates: ${rows.length}`);
  for (const row of rows) {
    const m = row.body.match(MEDIA_RE);
    if (!m) continue;
    const mediaType = m[1].toLowerCase();
    const urlMatch = m[2].match(/https?:\/\/\S+/i);
    if (!urlMatch) {
      console.log(`skip ${row.id}: no url`);
      continue;
    }
    const link = urlMatch[0].replace(/[),.;]+$/, "");
    const caption = m[2].slice(0, urlMatch.index).trim();
    try {
      const res = await fetch(link, { signal: AbortSignal.timeout(45_000) });
      console.log(`fetch ${row.id} → ${res.status}`);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > 20 * 1024 * 1024) continue;
      const mime =
        res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      const ext = mime.includes("png")
        ? "png"
        : mime.includes("webp")
          ? "webp"
          : mime.includes("mp4")
            ? "mp4"
            : "jpg";
      const s3Key = `enquiries/${new Date().getFullYear()}/wa-${randomUUID()}.${ext}`;
      const s3Url = await uploadAsset(s3Key, buf, mime);
      if (!s3Url) {
        console.log(`upload failed ${row.id}`);
        continue;
      }
      await prisma.enquiryAttachment.create({
        data: {
          messageId: row.id,
          fileName: `whatsapp-${mediaType}.${ext}`,
          mimeType: mime,
          fileSizeBytes: buf.length,
          s3Key,
          s3Url,
        },
      });
      await prisma.enquiryMessage.update({
        where: { id: row.id },
        data: { body: caption || `[${mediaType}]` },
      });
      console.log(`mirrored ${row.id}`);
    } catch (e) {
      console.error(row.id, e instanceof Error ? e.message : e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
