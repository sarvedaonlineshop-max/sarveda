#!/bin/bash
# Run ON Lightsail API instance (browser SSH or working .pem).
# Applies fuzzy-match catalog fixes from apply-plan.json.
set -euo pipefail
cd ~/sarveda || cd /home/ubuntu/sarveda || { echo "Clone repo first"; exit 1; }
git pull origin main || true
mkdir -p data/compare/fuzzy-apply
# If plan missing, copy from dev machine first:
# scp data/compare/fuzzy-apply/apply-plan.json ubuntu@LIGHTSAIL:~/sarveda/data/compare/fuzzy-apply/
if [[ ! -f data/compare/fuzzy-apply/apply-plan.json ]]; then
  echo "Missing data/compare/fuzzy-apply/apply-plan.json — copy from dev machine first."
  exit 1
fi
cd backend
npm install --silent 2>/dev/null || true
npx prisma generate
npx tsx scripts/apply-fuzzy-match-decisions.ts --apply
echo "Done. Spot-check: curl -s http://127.0.0.1:5000/api/products/macrame-yoga-mat-straps | jq '.data.product.variants[]|select(.sku==\"YO-MMS-O\")|.attributeValues[0].attributeValue.value'"
