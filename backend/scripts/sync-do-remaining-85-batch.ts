/**
 * Sync the remaining ~85 launch-matched products (147 total minus 62 done batch).
 *
 * Pulls from DO: prices, stock, description, short description, accordion (key features),
 * pair-with, product-level images, variant thumb + video. **Skips carousel gallery** —
 * run `sync-do-variant-galleries.ts --apply` once after all content sync is complete.
 *
 * Slug list: data/compare/remaining-85-launch-slugs.json
 * Regenerate: npx tsx scripts/generate-remaining-85-launch-slugs.ts
 *
 * Usage (Lightsail):
 *   npx tsx scripts/sync-do-remaining-85-batch.ts
 *   npx tsx scripts/sync-do-remaining-85-batch.ts --apply
 *   npx tsx scripts/sync-do-remaining-85-batch.ts --apply --limit=10
 */
import { execSync } from "child_process";
import path from "path";

const REPO = path.resolve(__dirname, "../..");
const SLUGS_FILE = path.join(REPO, "data/compare/remaining-85-launch-slugs.json");

const passthrough = process.argv.slice(2).filter((a) => a !== "--apply");
const apply = process.argv.includes("--apply");

const cmd = [
  "npx tsx scripts/sync-do-partial-41-batch.ts",
  apply ? "--apply" : "",
  "--skip-gallery",
  `--slugs-file=${SLUGS_FILE}`,
  ...passthrough,
]
  .filter(Boolean)
  .join(" ");

execSync(cmd, { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
