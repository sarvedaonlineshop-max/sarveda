import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const COMPLAINTS_BUCKET = process.env.AWS_S3_COMPLAINTS_BUCKET_NAME?.trim() ?? "";

function complaintsRegion(): string {
  return (
    process.env.AWS_S3_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    "ap-south-1"
  );
}

function credentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey };
}

let client: S3Client | null = null;

function s3Client(): S3Client {
  if (client) return client;
  const creds = credentials();
  if (!creds) {
    throw new Error("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY not configured");
  }
  client = new S3Client({ region: complaintsRegion(), credentials: creds });
  return client;
}

function publicComplaintUrl(s3Key: string): string {
  const cdn = process.env.AWS_COMPLAINTS_CLOUDFRONT_URL?.trim()?.replace(/\/$/, "");
  if (cdn) return `${cdn}/${s3Key}`;
  const region = complaintsRegion();
  if (region === "us-east-1") {
    return `https://${COMPLAINTS_BUCKET}.s3.amazonaws.com/${s3Key}`;
  }
  return `https://${COMPLAINTS_BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;
}

export function complaintsBucketName(): string | null {
  return COMPLAINTS_BUCKET || null;
}

export async function uploadComplaintMedia(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<{ s3Key: string; s3Url: string }> {
  if (!COMPLAINTS_BUCKET) {
    throw new Error("AWS_S3_COMPLAINTS_BUCKET_NAME not configured");
  }
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "bin";
  const s3Key = `complaints/${new Date().getFullYear()}/${randomUUID()}.${ext}`;

  await s3Client().send(
    new PutObjectCommand({
      Bucket: COMPLAINTS_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: mimeType
    })
  );

  return { s3Key, s3Url: publicComplaintUrl(s3Key) };
}

export async function getSignedComplaintMediaUrl(s3Key: string): Promise<string> {
  if (!COMPLAINTS_BUCKET) {
    throw new Error("AWS_S3_COMPLAINTS_BUCKET_NAME not configured");
  }
  const command = new GetObjectCommand({
    Bucket: COMPLAINTS_BUCKET,
    Key: s3Key
  });
  return getSignedUrl(s3Client(), command, { expiresIn: 3600 });
}
