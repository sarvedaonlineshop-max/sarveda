import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { zohoGet } = await import("../src/modules/zoho/zoho-client");
  const a = await zohoGet<{ contacts?: Record<string, unknown>[] }>("/contacts?page=1&per_page=2");
  const c = a.contacts?.[0] as Record<string, unknown> | undefined;
  console.log("list keys", c ? Object.keys(c) : null);
  console.log("list billing/shipping", c?.billing_address, c?.shipping_address);

  const id = c?.contact_id as string | undefined;
  if (id) {
    const d = await zohoGet<{ contact?: Record<string, unknown> }>(`/contacts/${id}`);
    console.log("detail billing", d.contact?.billing_address);
    console.log("detail shipping", d.contact?.shipping_address);
  }

  for (const q of [
    "/contacts?address_contains=Mumbai&per_page=5",
    "/contacts?search_text=Mumbai&per_page=5",
    "/invoices?search_text=Mumbai&per_page=5"
  ]) {
    try {
      const r = await zohoGet<Record<string, unknown>>(q);
      const rows = (r.contacts as unknown[]) || (r.invoices as unknown[]) || [];
      console.log(q, "->", rows.length);
    } catch (e) {
      console.log(q, "ERR", (e as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
