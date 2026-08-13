#!/bin/bash
# Run ON Lightsail after git pull.
set -euo pipefail
cd ~/sarveda/backend
npx tsx scripts/fix-pending-copper-zafu.ts
npx tsx scripts/fix-pending-copper-zafu.ts --apply
pm2 restart sarveda-backend --update-env 2>/dev/null || true
echo "Done."
