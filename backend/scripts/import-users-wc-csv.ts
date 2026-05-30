/**
 * Import WooCommerce customers from WP All Export CSV (May-30 batch).
 * Passwords are NOT migrated (WP $wp$ hashes) — customers use OTP / Google / reset later.
 *
 * Usage: npx tsx scripts/import-users-wc-csv.ts [--dry-run]
 */
import { PrismaClient, Role } from "@prisma/client";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { assertFile, may30 } from "./migration-paths";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function mapRole(raw: string): Role {
  const r = raw.toLowerCase();
  if (r.includes("administrator") || r.includes("shop_manager")) return Role.ADMIN;
  return Role.CUSTOMER;
}

function normEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e;
}

async function main() {
  const csvPath = may30.usersCsv();
  assertFile(csvPath, "users CSV");
  const rows = parse(fs.readFileSync(csvPath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  }) as Record<string, string>[];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = normEmail(row.user_email ?? row.email ?? "");
    const wooId = parseInt(String(row.source_user_id ?? "").replace(/\D/g, ""), 10);
    if (!email || !wooId) {
      skipped++;
      continue;
    }

    const name =
      row.display_name?.trim() ||
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
      row.user_login?.trim() ||
      null;
    const phone = row.billing_phone?.trim() || row.phone?.trim() || null;
    const role = mapRole(row.role ?? "customer");

    const data = {
      email,
      name,
      phone: phone || null,
      role,
      wooCommerceId: wooId,
      isVerified: false
    };

    if (dryRun) {
      created++;
      continue;
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { wooCommerceId: wooId }] }
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          wooCommerceId: wooId,
          name: data.name ?? existing.name,
          phone: data.phone ?? existing.phone,
          role: existing.role === Role.SUPER_ADMIN ? existing.role : role
        }
      });
      updated++;
    } else {
      await prisma.user.create({ data });
      created++;
    }
  }

  console.log(`Users CSV: ${rows.length} rows → created ${created}, updated ${updated}, skipped ${skipped}${dryRun ? " (dry)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
