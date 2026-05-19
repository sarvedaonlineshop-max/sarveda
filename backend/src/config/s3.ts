import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { logger } from "./logger";

let client: S3Client | null = null;

function s3Client(): S3Client | null {
  const key = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  if (!key || !secret) return null;
  if (!client) {
    client = new S3Client({
      region,
      credentials: { accessKeyId: key, secretAccessKey: secret }
    });
  }
  return client;
}

function bucketName(): string | null {
  return process.env.AWS_S3_BUCKET_NAME?.trim() || null;
}

function publicUrlForKey(key: string): string {
  const cdn = process.env.AWS_CLOUDFRONT_URL?.trim()?.replace(/\/$/, "");
  if (cdn) return `${cdn}/${key}`;
  const bucket = bucketName();
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export function getPublicMediaUrl(key: string): string {
  return publicUrlForKey(key);
}

function contentTypeForKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

/** Upload binary asset; returns public URL or null if S3 not configured. */
export async function uploadAsset(
  key: string,
  body: Buffer,
  contentType?: string
): Promise<string | null> {
  const c = s3Client();
  const bucket = bucketName();
  if (!c || !bucket) {
    logger.warn("s3_upload_skipped", { key, reason: "AWS credentials or bucket missing" });
    return null;
  }
  await c.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType ?? contentTypeForKey(key),
      CacheControl: "public, max-age=31536000, immutable"
    })
  );
  return publicUrlForKey(key);
}

/** Download remote URL and upload to S3. */
export async function mirrorUrlToS3(sourceUrl: string, key: string): Promise<string | null> {
  const res = await fetch(sourceUrl, {
    headers: { "User-Agent": "SarvedaMediaMigrator/1.0" },
    signal: AbortSignal.timeout(60_000)
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${sourceUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return uploadAsset(key, buf);
}

/** Upload PDF buffer; returns public URL or null if S3 not configured. */
export async function uploadPdf(key: string, body: Buffer): Promise<string | null> {
  const c = s3Client();
  const bucket = bucketName();
  if (!c || !bucket) {
    logger.warn("s3_upload_skipped", { key, reason: "AWS credentials or bucket missing" });
    return null;
  }
  await c.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/pdf",
      CacheControl: "private, max-age=31536000"
    })
  );
  return publicUrlForKey(key);
}
