#!/bin/bash
# Sarveda DB Migration Runbook
# Run on EC2: bash backend/scripts/run-migrations.sh

set -e

echo "======================================"
echo "  SARVEDA DB MIGRATION RUNBOOK"
echo "  $(date)"
echo "======================================"

# Check we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Run from the backend/ directory"
  exit 1
fi

# Check DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set. Source your .env first:"
  echo "   export \$(cat .env | grep DATABASE_URL)"
  exit 1
fi

echo ""
echo "📋 Pending migrations:"
npx prisma migrate status

echo ""
echo "⚠️  About to apply all pending migrations to RDS."
read -p "Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "🚀 Applying migrations..."
npx prisma migrate deploy

echo ""
echo "✅ Migrations complete. Verifying..."
npx prisma migrate status

echo ""
echo "📦 Generating Prisma client..."
npx prisma generate

echo ""
echo "======================================"
echo "✅ All done. Restart PM2:"
echo "   pm2 restart sarveda-backend"
echo "======================================"
