/**
 * Verify S3 bucket exists and AWS_S3_REGION matches bucket location.
 * Usage: npx tsx scripts/check-s3-bucket.ts
 */
import dotenv from "dotenv";
import path from "path";

import {
  assertS3RegionMatchesBucket,
  bucketName,
  resolveBucketRegion,
  s3Region
} from "../src/config/s3";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main(): Promise<void> {
  const bucket = bucketName();
  if (!bucket) {
    console.error("Set AWS_S3_BUCKET_NAME in backend/.env");
    process.exit(1);
  }

  const configured = s3Region();
  console.log(`Bucket: ${bucket}`);
  console.log(`Configured region (AWS_S3_REGION / AWS_REGION): ${configured}`);

  const actual = await resolveBucketRegion(bucket);
  console.log(`Actual bucket region: ${actual}`);

  if (actual !== configured) {
    console.error("\n❌ REGION MISMATCH — uploads will fail with 'specified endpoint' error.");
    console.error(`\nFix on EC2 — add to backend/.env:\n  AWS_S3_REGION=${actual}\n`);
    console.error("Then: npm run migrate:media\n");
    process.exit(1);
  }

  assertS3RegionMatchesBucket(actual);
  console.log("\n✅ S3 region OK. Safe to run npm run migrate:media");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
