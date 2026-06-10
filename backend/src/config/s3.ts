import { GetBucketLocationCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { logger } from "./logger";

let client: S3Client | null = null;
let clientRegion: string | null = null;

/** S3 bucket region — must match where the bucket was created (see `npm run check:s3`). */
export function s3Region(): string {
  return (
    process.env.AWS_S3_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "ap-south-1"
  );
}

function credentials() {
  const key = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secret = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!key || !secret) return null;
  return { accessKeyId: key, secretAccessKey: secret };
}

export function bucketName(): string | null {
  return process.env.AWS_S3_BUCKET_NAME?.trim() || null;
}

/** Normalize GetBucketLocation response (null/""/US → us-east-1). */
export function normalizeBucketRegion(location: string | null | undefined): string {
  if (!location || location === "US") return "us-east-1";
  return location;
}

/** Resolve actual bucket region from AWS (for startup checks / migrate script). */
export async function resolveBucketRegion(bucket: string): Promise<string> {
  const creds = credentials();
  if (!creds) throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing");

  // GetBucketLocation must be called against us-east-1 for legacy buckets.
  const probe = new S3Client({ region: "us-east-1", credentials: creds });
  const out = await probe.send(new GetBucketLocationCommand({ Bucket: bucket }));
  return normalizeBucketRegion(out.LocationConstraint ?? undefined);
}

export function assertS3RegionMatchesBucket(actualRegion: string): void {
  const configured = s3Region();
  if (actualRegion !== configured) {
    throw new Error(
      `S3 region mismatch: bucket "${bucketName()}" is in ${actualRegion} but ` +
        `AWS_S3_REGION/AWS_REGION is ${configured}. ` +
        `On EC2 set AWS_S3_REGION=${actualRegion} in backend/.env and rerun migrate:media.`
    );
  }
}

function s3Client(): S3Client | null {
  const creds = credentials();
  const region = s3Region();
  if (!creds) return null;
  if (!client || clientRegion !== region) {
    client = new S3Client({ region, credentials: creds });
    clientRegion = region;
  }
  return client;
}

function publicUrlForKey(key: string): string {
  const cdn = process.env.AWS_CLOUDFRONT_URL?.trim()?.replace(/\/$/, "");
  if (cdn) return `${cdn}/${key}`;
  const bucket = bucketName();
  const region = s3Region();
  if (!bucket) return key;
  if (region === "us-east-1") {
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }
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
/** Extract object key from a stored S3/CloudFront invoice URL. */
export function s3KeyFromStoredUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!path) return null;
    const bucket = bucketName();
    const cdn = process.env.AWS_CLOUDFRONT_URL?.trim()?.replace(/^\w+:\/\//, "").replace(/\/$/, "");
    if (cdn && parsed.hostname === cdn.split("/")[0]) {
      return path;
    }
    if (parsed.hostname.includes("amazonaws.com") && path) {
      return path;
    }
    if (bucket && path.startsWith("invoices/")) {
      return path;
    }
    return null;
  } catch {
    return null;
  }
}

export async function downloadPdfFromS3(key: string): Promise<Buffer | null> {
  const c = s3Client();
  const bucket = bucketName();
  if (!c || !bucket) return null;
  const out = await c.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await out.Body?.transformToByteArray();
  return bytes ? Buffer.from(bytes) : null;
}

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
