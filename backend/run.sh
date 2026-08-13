#!/bin/sh
# Lightsail deploy — pull code without losing live compare CSV dumps.
set -e
cd ~/sarveda || exit 1

BACKUP="$HOME/sarveda-live-compare-backup-$(date +%Y%m%d%H%M)"
mkdir -p "$BACKUP"
for f in \
  data/compare/do_products.csv \
  data/compare/do_variants.csv \
  data/compare/do_attachments.csv \
  data/compare/do-ls-pull-list.xlsx \
  data/compare/do-media-pull-results.json \
  data/compare/lightsail-catalog-export.json \
  data/media-migration-map.json
do
  [ -f "$f" ] && cp -a "$f" "$BACKUP/"
done

# Untracked local copy blocks git pull once run.sh is tracked on main
if [ -f backend/run.sh ] && ! git ls-files --error-unmatch backend/run.sh >/dev/null 2>&1; then
  rm -f backend/run.sh
fi

# Allow git pull when compare CSVs were refreshed on-server (not committed)
git checkout -- data/compare/do_products.csv data/compare/do_variants.csv 2>/dev/null || true

git pull origin main

# Restore live dumps (fresher than repo snapshots)
for f in do_products.csv do_variants.csv do_attachments.csv do-ls-pull-list.xlsx do-media-pull-results.json lightsail-catalog-export.json
do
  [ -f "$BACKUP/$f" ] && cp -a "$BACKUP/$f" "data/compare/$f"
done
[ -f "$BACKUP/media-migration-map.json" ] && cp -a "$BACKUP/media-migration-map.json" data/media-migration-map.json

cd backend || exit 1
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart sarveda-backend --update-env
