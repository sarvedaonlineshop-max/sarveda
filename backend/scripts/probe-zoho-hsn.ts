/**
 * Probe Zoho Books Items API for HSN/SAC fields.
 * Usage: cd backend && npx tsx scripts/probe-zoho-hsn.ts
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { zohoGet } = await import("../src/modules/zoho/zoho-client");

  const res = await zohoGet<{
    items: Record<string, unknown>[];
    page_context: { has_more_page: boolean; total?: number };
  }>("/items?page=1&per_page=5&status=active");

  const sample = (res.items ?? []).slice(0, 3);
  console.log("page_context:", res.page_context);
  if (sample[0]) {
    console.log("item keys:", Object.keys(sample[0]).sort().join(", "));
  }
  for (const i of sample) {
    console.log({
      sku: i.sku,
      name: String(i.name ?? "").slice(0, 50),
      hsn_or_sac: i.hsn_or_sac,
      hsn_sac: i.hsn_sac,
      hsn: i.hsn
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
