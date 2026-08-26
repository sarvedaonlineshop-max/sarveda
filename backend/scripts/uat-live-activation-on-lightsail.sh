#!/usr/bin/env bash
# Lightsail operator steps — Accounting UAT activation (production posting OFF)
# Run on ubuntu@Lightsail after git is clean on 5c76ffa+ (with UAT banner commit if any).
set -euo pipefail

cd "${HOME}/sarveda"

echo "=== git ==="
git fetch origin main
git status -sb
git log -1 --oneline

echo "=== migration status (before) ==="
cd backend
npx prisma migrate status || true

echo "=== install / migrate / build ==="
npm install
npx prisma migrate deploy
npm run build

echo "=== migration status (after) ==="
npx prisma migrate status || true

echo ""
echo "=== REQUIRED: set these in backend/.env (then pm2 restart) ==="
cat <<'EOF'
PURCHASES_MODULE_ENABLED=1
NATIVE_ACCOUNTING_ENABLED=1
ACCOUNTING_SALES_POSTING_ENABLED=1
ACCOUNTING_REFUND_POSTING_ENABLED=1
ACCOUNTING_SETTLEMENT_POSTING_ENABLED=1
ACCOUNTING_PURCHASES_POSTING_ENABLED=1
ACCOUNTING_VENDOR_PAYMENT_POSTING_ENABLED=1
ACCOUNTING_EXPENSE_POSTING_ENABLED=1
ACCOUNTING_INVENTORY_VALUATION_ENABLED=1
ACCOUNTING_PURCHASE_CAPITALIZATION_ENABLED=1
ACCOUNTING_COGS_POSTING_ENABLED=1
ACCOUNTING_COGS_REVERSAL_ENABLED=1
ACCOUNTING_BANKING_ENABLED=1
ACCOUNTING_BANK_STATEMENT_IMPORT_ENABLED=1
ACCOUNTING_BANK_RECONCILIATION_ENABLED=1
ACCOUNTING_GST_ENABLED=1
ACCOUNTING_GST_RECONCILIATION_ENABLED=1
ACCOUNTING_ITC_VERIFICATION_ENABLED=1
ACCOUNTING_GST_REPORTING_ENABLED=1
ACCOUNTING_REPORTS_ENABLED=1
ACCOUNTING_OPENING_BALANCE_ENABLED=0
ACCOUNTING_CUTOVER_DATE=2026-09-01T00:00:00+05:30
ACCOUNTING_CUTOVER_FORWARD_ONLY=1
ACCOUNTING_PRODUCTION_POSTING_ALLOWED=0
ACCOUNTING_BULK_DISCOVERY_ALLOWED=0
EOF

echo ""
echo "Vercel: NEXT_PUBLIC_ACCOUNTING_ENABLED=1 NEXT_PUBLIC_PURCHASES_ENABLED=1 NEXT_PUBLIC_ACCOUNTING_UAT_MODE=1"
echo "Then: pm2 restart sarveda-backend  (or your process name)"
echo "Dry-run cleanup: npx ts-node --transpile-only scripts/uat-cleanup-dry-run.ts"
echo "DO NOT set ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1 until Phase 7D."
