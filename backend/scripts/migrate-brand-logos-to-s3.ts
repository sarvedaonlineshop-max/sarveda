/**
 * Upload Sarveda brand logos from live WooCommerce URLs to S3 under stable `brand/` keys.
 *
 * Usage:
 *   npx tsx scripts/migrate-brand-logos-to-s3.ts --dry-run
 *   npm run migrate:brand
 *
 * Writes data/brand-assets.json with public CDN URLs (for invoices, email, frontend).
 */
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import {
  assertS3RegionMatchesBucket,
  bucketName as getBucket,
  mirrorUrlToS3,
  resolveBucketRegion,
  s3Region
} from "../src/config/s3";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const dryRun = process.argv.includes("--dry-run");

const MANIFEST_FILE = path.resolve(__dirname, "../../data/brand-assets.json");

/** Primary site logos from WordPress media library (sarveda.com). */
const BRAND_ASSETS = [
  {
    id: "logo-square",
    description: "Square mark (137×120)",
    sourceUrl: "https://sarveda.com/wp-content/uploads/2020/11/logo.png",
    s3Key: "brand/logo.png"
  },
  {
    id: "logo-horizontal",
    description: "Horizontal header logo (629×256) — best for invoices",
    sourceUrl: "https://sarveda.com/wp-content/uploads/2020/12/logo_Horizontal.png",
    s3Key: "brand/logo-horizontal.png"
  },
  {
    id: "logo-white",
    description: "White logo for dark backgrounds",
    sourceUrl: "https://sarveda.com/wp-content/uploads/2020/11/logo-white.png",
    s3Key: "brand/logo-white.png"
  },
  {
    id: "favicon-32",
    description: "Favicon 32×32",
    sourceUrl: "https://sarveda.com/wp-content/uploads/2020/12/cropped-Sarveda_Favicon-32x32.png",
    s3Key: "brand/favicon-32.png"
  }
] as const;

type ManifestEntry = {
  id: string;
  description: string;
  sourceUrl: string;
  s3Key: string;
  publicUrl: string;
  format: string;
};

function formatFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "PNG";
  if (ext === "jpg" || ext === "jpeg") return "JPEG";
  if (ext === "svg") return "SVG";
  if (ext === "webp") return "WEBP";
  return ext.toUpperCase();
}

async function main(): Promise<void> {
  const bucket = getBucket();
  if (!bucket) {
    console.error("Set AWS_S3_BUCKET_NAME in backend/.env");
    process.exit(1);
  }

  let actualRegion = s3Region();
  if (dryRun) {
    console.log(`[dry-run] S3 bucket ${bucket} (region check skipped)`);
  } else {
    actualRegion = await resolveBucketRegion(bucket);
    console.log(`S3 bucket ${bucket} (${actualRegion}); configured ${s3Region()}`);
    assertS3RegionMatchesBucket(actualRegion);
  }

  const manifest: ManifestEntry[] = [];

  for (const asset of BRAND_ASSETS) {
    if (dryRun) {
      console.log(`[dry-run] ${asset.sourceUrl} → s3://${bucket}/${asset.s3Key}`);
      manifest.push({
        id: asset.id,
        description: asset.description,
        sourceUrl: asset.sourceUrl,
        s3Key: asset.s3Key,
        publicUrl: `(dry-run) ${asset.s3Key}`,
        format: formatFromKey(asset.s3Key)
      });
      continue;
    }

    try {
      const publicUrl = await mirrorUrlToS3(asset.sourceUrl, asset.s3Key);
      if (!publicUrl) {
        console.error("✗ S3 not configured — skip:", asset.id);
        continue;
      }
      console.log(`✓ ${asset.id} → ${publicUrl}`);
      manifest.push({
        id: asset.id,
        description: asset.description,
        sourceUrl: asset.sourceUrl,
        s3Key: asset.s3Key,
        publicUrl,
        format: formatFromKey(asset.s3Key)
      });
    } catch (err) {
      console.error(`✗ ${asset.id}:`, err instanceof Error ? err.message : err);
    }
  }

  if (!dryRun && manifest.length) {
    const payload = {
      updatedAt: new Date().toISOString(),
      bucket,
      region: actualRegion,
      invoiceLogoUrl: manifest.find((m) => m.id === "logo-horizontal")?.publicUrl ?? null,
      assets: manifest
    };
    fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(payload, null, 2));
    console.log(`\nWrote ${MANIFEST_FILE}`);
    console.log(`Invoice logo URL: ${payload.invoiceLogoUrl}`);
    console.log("Optional EC2 .env: SELLER_LOGO_URL=<invoiceLogoUrl>");
  }

  console.log(`\nDone. ${manifest.length}/${BRAND_ASSETS.length} assets.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
