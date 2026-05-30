/**
 * WordPress export paths — May 30, 2026 batch (data/May-30/).
 * Override with env SARVEDA_DATA_DIR or CLI --data-dir=/path
 */
import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_BATCH = path.join(REPO_ROOT, "data", "May-30");

function batchDir(): string {
  const env = process.env.SARVEDA_DATA_DIR?.trim();
  const arg = process.argv.find((a) => a.startsWith("--data-dir="))?.slice("--data-dir=".length);
  return path.resolve(arg || env || DEFAULT_BATCH);
}

/** Pick largest matching file (handles duplicate exports posts-1 / products-1). */
function pickLargest(dir: string, pattern: RegExp): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => pattern.test(f));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size);
  return path.join(dir, files[0]!);
}

export function getDataDir(): string {
  return batchDir();
}

export const may30 = {
  dir: () => batchDir(),

  courses: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-courses.xml"),
  events: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-events.xml"),
  pages: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-pages.xml"),
  posts: () => pickLargest(batchDir(), /^sarveda\.WordPress\.2026-05-30-posts.*\.xml$/i) ?? path.join(batchDir(), "sarveda.WordPress.2026-05-30-posts.xml"),
  products: () =>
    pickLargest(batchDir(), /^sarveda\.WordPress\.2026-05-30-products.*\.xml$/i) ??
    path.join(batchDir(), "sarveda.WordPress.2026-05-30-products-1.xml"),
  media: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-media.xml"),
  variations: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-variations.xml"),
  coupons: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-coupons.xml"),
  vaidya: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-vaidya.xml"),
  mentors: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-mentors.xml"),
  retreats: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-retreats.xml"),
  testimonials: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-testimonials.xml"),
  offers: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-offers.xml"),
  taxonomies: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-taxonomies.xml"),
  fields: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-fields.xml"),
  fieldGroups: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-field_groups.xml"),
  optionPages: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-option_pages.xml"),
  forms: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-forms.xml"),
  zoom: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-zoom-meetings-and-webinars.xml"),
  refunds: () => path.join(batchDir(), "sarveda.WordPress.2026-05-30-refund.xml"),
  orders: () =>
    pickLargest(batchDir(), /^sarveda\.WordPress\.2026-05-30-orders.*\.xml$/i) ??
    path.join(batchDir(), "sarveda.WordPress.2026-05-30-orders-1.xml"),
  usersCsv: () => {
    const dir = batchDir();
    const csv = fs.readdirSync(dir).find((f) => f.startsWith("user-export") && f.endsWith(".csv"));
    return csv ? path.join(dir, csv) : path.join(dir, "user-export-2-6a1aa18920817.csv");
  },

  /** Legacy product seed CSV (copy fresh Woo export here when available). */
  wcProductsCsv: () => path.resolve(REPO_ROOT, "backend/prisma/wc-products.csv")
};

export function assertFile(p: string, label: string): void {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${label}: ${p}`);
  }
}
