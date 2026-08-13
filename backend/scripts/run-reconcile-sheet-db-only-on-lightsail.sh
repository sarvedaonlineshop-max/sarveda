#!/bin/bash
# Run ON Lightsail after git pull.
set -euo pipefail
cd ~/sarveda/backend
npx tsx scripts/reconcile-sheet-db-only.ts --apply
pm2 restart sarveda-backend --update-env 2>/dev/null || true
echo "Done. Re-run fuzzy compare from dev to verify."
