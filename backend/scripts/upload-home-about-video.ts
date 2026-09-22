/**
 * Upload the homepage about video + poster to public S3 (media/*).
 *
 * Usage:
 *   cd backend && npx tsx scripts/upload-home-about-video.ts /path/to/sarveda-home.mp4 /path/to/poster.jpg
 */
import fs from "fs";
import path from "path";

import { uploadAsset } from "../src/config/s3";

const VIDEO_KEY = "media/home/homepage-about.mp4";
const POSTER_KEY = "media/home/homepage-about-poster.jpg";

async function main() {
  const videoPath = process.argv[2];
  const posterPath = process.argv[3];
  if (!videoPath || !posterPath) {
    console.error("Usage: npx tsx scripts/upload-home-about-video.ts <video.mp4> <poster.jpg>");
    process.exit(1);
  }

  const video = fs.readFileSync(path.resolve(videoPath));
  const poster = fs.readFileSync(path.resolve(posterPath));

  const videoUrl = await uploadAsset(VIDEO_KEY, video, "video/mp4");
  const posterUrl = await uploadAsset(POSTER_KEY, poster, "image/jpeg");

  if (!videoUrl || !posterUrl) {
    console.error("S3 upload skipped — AWS credentials or bucket missing.");
    process.exit(2);
  }

  console.log("video", videoUrl);
  console.log("poster", posterUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
