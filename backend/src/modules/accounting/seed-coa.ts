import type { AccountingAccountType } from "@prisma/client";

import { prisma } from "../../config/db";

export type CoAEntry = {
  code: string;
  name: string;
  type: AccountingAccountType;
  description?: string;
  isSystem?: boolean;
};

/** Practical Sarveda / Indian e-commerce Chart of Accounts (Phase 1 seed). */
export const SARVEDA_CHART_OF_ACCOUNTS: CoAEntry[] = [
  { code: "1000", name: "Cash", type: "ASSET", isSystem: true },
  { code: "1010", name: "Bank", type: "ASSET", isSystem: true },
  { code: "1020", name: "Razorpay Clearing", type: "ASSET", isSystem: true },
  { code: "1021", name: "Stripe Clearing", type: "ASSET", isSystem: true },
  { code: "1022", name: "PayPal Clearing", type: "ASSET", isSystem: true },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", isSystem: true },
  { code: "1200", name: "Inventory Asset", type: "ASSET", isSystem: true },
  {
    code: "1210",
    name: "Inventory Purchases Clearing",
    type: "ASSET",
    isSystem: true,
    description:
      "Supplier-billed inventory cost pending Phase 3D receipt/cost-layer capitalization. Do not treat as finished Inventory Asset."
  },

  { code: "2000", name: "Accounts Payable", type: "LIABILITY", isSystem: true },
  { code: "2100", name: "Output CGST", type: "LIABILITY", isSystem: true },
  { code: "2101", name: "Output SGST", type: "LIABILITY", isSystem: true },
  { code: "2102", name: "Output IGST", type: "LIABILITY", isSystem: true },
  { code: "2200", name: "Input CGST", type: "LIABILITY", isSystem: true },
  { code: "2201", name: "Input SGST", type: "LIABILITY", isSystem: true },
  { code: "2202", name: "Input IGST", type: "LIABILITY", isSystem: true },

  { code: "3000", name: "Owner / Share Capital", type: "EQUITY", isSystem: true },
  { code: "3100", name: "Retained Earnings", type: "EQUITY", isSystem: true },
  {
    code: "3900",
    name: "Opening Balance Equity",
    type: "EQUITY",
    isSystem: true,
    description: "Cutover opening inventory and balance-sheet equity offset (Phase 3D1)."
  },

  { code: "4000", name: "Product Sales", type: "REVENUE", isSystem: true },
  { code: "4100", name: "Shipping Income", type: "REVENUE", isSystem: true },
  { code: "4200", name: "Discounts (Contra Revenue)", type: "REVENUE", isSystem: true, description: "Contra revenue — credits reduce gross sales; not an expense." },
  { code: "4500", name: "Interest Income", type: "REVENUE", isSystem: true, description: "Bank interest credited on statement (Phase 4D)." },

  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", isSystem: true },
  { code: "5100", name: "Payment Gateway Charges", type: "EXPENSE", isSystem: true },
  { code: "5200", name: "Shipping Expense", type: "EXPENSE", isSystem: true },
  { code: "5300", name: "Purchase / Operating Expense", type: "EXPENSE", isSystem: true },
  { code: "5310", name: "Office Expense", type: "EXPENSE", isSystem: true },
  { code: "5320", name: "Professional Fees", type: "EXPENSE", isSystem: true },
  { code: "5330", name: "Utilities", type: "EXPENSE", isSystem: true },
  { code: "5340", name: "Travel", type: "EXPENSE", isSystem: true },
  { code: "5350", name: "Repairs & Maintenance", type: "EXPENSE", isSystem: true },
  { code: "5360", name: "Marketing / Advertising", type: "EXPENSE", isSystem: true },
  { code: "5370", name: "Software / Subscription", type: "EXPENSE", isSystem: true },
  { code: "5380", name: "Misc Operating Expense", type: "EXPENSE", isSystem: true },
  { code: "5390", name: "Bank Charges Expense", type: "EXPENSE", isSystem: true, description: "Bank statement charges (Phase 4D)." }
];

export async function seedAccountingChartOfAccounts(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const row of SARVEDA_CHART_OF_ACCOUNTS) {
    const existing = await prisma.accountingAccount.findUnique({ where: { code: row.code } });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.accountingAccount.create({
      data: {
        code: row.code,
        name: row.name,
        type: row.type,
        description: row.description,
        isSystem: row.isSystem ?? false,
        isActive: true,
        currency: "INR"
      }
    });
    created += 1;
  }

  return { created, skipped };
}

export async function listAccountingAccounts() {
  return prisma.accountingAccount.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { code: "asc" }]
  });
}

export async function getAccountingAccountByCode(code: string) {
  return prisma.accountingAccount.findUnique({ where: { code } });
}
