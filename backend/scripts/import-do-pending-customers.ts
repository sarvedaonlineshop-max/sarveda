/**
 * Safely import missing DigitalOcean WP customers into Sarveda User.
 *
 * Source: JSON from dump_do_woo_orders_for_legacy.py (wpUsers + gap order emails).
 *
 * Safety rules:
 * - Never create ADMIN / SUPER_ADMIN from WP dump (always CUSTOMER)
 * - Skip if email or wooCommerceId already exists
 * - Skip invalid / placeholder emails
 * - Phone: omit if blank or already taken (unique constraint)
 * - No passwords (OTP / Google / reset later)
 * - Dry-run by default; pass --apply to write
 *
 * Usage:
 *   npx tsx scripts/import-do-pending-customers.ts /tmp/do_woo_orders_legacy_gap.json
 *   npx tsx scripts/import-do-pending-customers.ts /tmp/do_woo_orders_legacy_gap.json --apply
 *   npx tsx scripts/import-do-pending-customers.ts dump.json --apply --include-guest-emails
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, Role } from "@prisma/client";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const includeGuests = process.argv.includes("--include-guest-emails");
const dryRun = !apply;

type DumpUser = {
  wooCommerceId: number;
  email: string;
  displayName: string;
  registered: string;
  billingEmail: string;
  billingPhone: string;
  firstName: string;
  lastName: string;
};

type DumpOrder = {
  wooCommerceId: number;
  meta: Record<string, string>;
};

type DumpFile = {
  wpUsers: DumpUser[];
  orders: DumpOrder[];
};

function normEmail(raw: string | null | undefined): string | null {
  const e = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!e || !e.includes("@")) return null;
  if (e.endsWith("@localhost")) return null;
  if (e.includes("no-email@import") || e.includes("@import.sarveda.local")) return null;
  if (e.includes(" ")) return null;
  return e;
}

function normPhone(raw: string | null | undefined): string | null {
  const p = String(raw ?? "").trim();
  if (!p || p.length < 6) return null;
  return p.slice(0, 32);
}

function displayName(u: DumpUser): string | null {
  const n =
    u.displayName?.trim() ||
    [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
    "";
  return n || null;
}

async function main() {
  const fileArg = process.argv.find((a) => a.endsWith(".json") && !a.startsWith("--"));
  if (!fileArg) {
    console.error(
      "Usage: npx tsx scripts/import-do-pending-customers.ts <dump.json> [--apply] [--include-guest-emails]"
    );
    process.exit(1);
  }
  const dumpPath = path.resolve(fileArg);
  const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8")) as DumpFile;
  console.log(
    `Mode: ${dryRun ? "DRY-RUN" : "APPLY"} | WP users: ${dump.wpUsers?.length ?? 0} | includeGuests=${includeGuests}`
  );

  const existing = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, email: true, wooCommerceId: true, phone: true }
  });
  const emails = new Set(existing.map((u) => u.email.trim().toLowerCase()));
  const wooIds = new Set(
    existing.map((u) => u.wooCommerceId).filter((x): x is number => x != null)
  );
  const phones = new Set(
    existing.map((u) => u.phone).filter((x): x is string => Boolean(x && x.trim()))
  );

  type Candidate = {
    email: string;
    wooCommerceId: number | null;
    name: string | null;
    phone: string | null;
    source: "wp_user" | "guest_order";
  };

  const candidates: Candidate[] = [];
  const seenEmails = new Set<string>();

  for (const u of dump.wpUsers ?? []) {
    const email = normEmail(u.email) || normEmail(u.billingEmail);
    if (!email) continue;
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    candidates.push({
      email,
      wooCommerceId: u.wooCommerceId,
      name: displayName(u),
      phone: normPhone(u.billingPhone),
      source: "wp_user"
    });
  }

  if (includeGuests) {
    for (const o of dump.orders ?? []) {
      const email = normEmail(o.meta?._billing_email);
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);
      const name = [o.meta?._billing_first_name, o.meta?._billing_last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      candidates.push({
        email,
        wooCommerceId: null,
        name: name || null,
        phone: normPhone(o.meta?._billing_phone),
        source: "guest_order"
      });
    }
  }

  let created = 0;
  let skippedExisting = 0;
  let skippedPhoneClash = 0;
  let skippedWooClash = 0;
  let errors = 0;
  const createdSamples: string[] = [];
  const skippedSamples: string[] = [];

  for (const c of candidates) {
    if (emails.has(c.email)) {
      skippedExisting++;
      continue;
    }
    if (c.wooCommerceId != null && wooIds.has(c.wooCommerceId)) {
      // Woo ID already on another account — do not attach / create duplicate.
      skippedWooClash++;
      if (skippedSamples.length < 10) {
        skippedSamples.push(`wooId clash ${c.wooCommerceId} ${c.email}`);
      }
      continue;
    }

    let phone = c.phone;
    if (phone && phones.has(phone)) {
      phone = null;
      skippedPhoneClash++;
    }

    if (dryRun) {
      created++;
      emails.add(c.email);
      if (c.wooCommerceId != null) wooIds.add(c.wooCommerceId);
      if (phone) phones.add(phone);
      if (createdSamples.length < 12) createdSamples.push(`${c.email} (${c.source})`);
      continue;
    }

    try {
      await prisma.user.create({
        data: {
          email: c.email,
          name: c.name,
          phone,
          role: Role.CUSTOMER,
          wooCommerceId: c.wooCommerceId,
          isVerified: false
        }
      });
      created++;
      emails.add(c.email);
      if (c.wooCommerceId != null) wooIds.add(c.wooCommerceId);
      if (phone) phones.add(phone);
      if (createdSamples.length < 12) createdSamples.push(`${c.email} (${c.source})`);
    } catch (e) {
      errors++;
      if (skippedSamples.length < 15) {
        skippedSamples.push(
          `error ${c.email}: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`
        );
      }
    }
  }

  const after = await prisma.user.count({ where: { deletedAt: null } });
  const report = {
    dryRun,
    includeGuests,
    candidates: candidates.length,
    created,
    skippedExisting,
    skippedWooClash,
    phoneClearedDueToClash: skippedPhoneClash,
    errors,
    usersAfter: after,
    createdSamples,
    skippedSamples
  };
  console.log(JSON.stringify(report, null, 2));

  const reportPath = path.resolve(
    path.dirname(dumpPath),
    `do-pending-customers-import-${new Date().toISOString().slice(0, 10)}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("Report:", reportPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
