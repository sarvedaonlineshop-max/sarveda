#!/usr/bin/env bash
# Install the Next.js storefront beside the API on this Lightsail box.
# Does not change DNS, port 80/443, or the API pm2 process.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NGINX_AVAILABLE="/etc/nginx/sites-available/sarveda-frontend-preview"
NGINX_ENABLED="/etc/nginx/sites-enabled/sarveda-frontend-preview"
ENV_FILE="$ROOT/frontend/.env.production.local"

if [[ ! -f "$ROOT/frontend/package.json" ]]; then
  echo "Expected the sarveda repo at $ROOT" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  echo "Create it on the server (do not commit it). Minimum:" >&2
  echo "  NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8080" >&2
  echo "  NEXT_PUBLIC_MEDIA_CDN_URL=https://sarveda-media.s3.amazonaws.com" >&2
  echo "  NEXT_PUBLIC_RAZORPAY_KEY_ID=<same public key as Vercel>" >&2
  echo "  JWT_SECRET=<same value as the API .env>" >&2
  echo "  BACKEND_PROXY_URL=http://127.0.0.1:4000" >&2
  echo "  INTERNAL_API_URL=http://127.0.0.1:4000" >&2
  exit 1
fi

echo "Building frontend. This does not restart the API."
cd "$ROOT/frontend"
npm ci
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}" npm run build

cd "$ROOT"
pm2 start deploy/lightsail/ecosystem.frontend.config.cjs --update-env || pm2 restart sarveda-frontend-preview --update-env
pm2 save

sudo cp "$ROOT/deploy/lightsail/nginx-frontend-preview.conf" "$NGINX_AVAILABLE"
sudo ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
sudo nginx -t
sudo systemctl reload nginx

echo "Preview is on port 8080 of this server. sarveda.com is unchanged."
echo "Open the Lightsail firewall for TCP 8080 only while you test, then close it."
