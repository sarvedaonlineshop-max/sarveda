#!/usr/bin/env bash
# Allow the website (80/443) only from Cloudflare. SSH on 22 stays open.
# Port 8080 was a public preview of the shop and is closed.
# Safe to run again: old Cloudflare rules are removed first, then the current list is added.
# Fetch the live ranges from https://www.cloudflare.com/ips-v4 and ips-v6.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

v4="$(curl -fsS https://www.cloudflare.com/ips-v4)"
v6="$(curl -fsS https://www.cloudflare.com/ips-v6)"
[[ -n "${v4}" && -n "${v6}" ]]

# Drop previously installed Cloudflare allows so a re-run does not stack duplicates.
while true; do
  num="$(ufw status numbered | sed -n 's/^\[\s*\([0-9][0-9]*\)\].*# cloudflare-.*/\1/p' | head -n 1)"
  [[ -n "${num}" ]] || break
  ufw --force delete "${num}"
done

while read -r cidr; do
  [[ -z "${cidr}" ]] && continue
  ufw allow from "${cidr}" to any port 80 proto tcp comment "cloudflare-http"
  ufw allow from "${cidr}" to any port 443 proto tcp comment "cloudflare-https"
done <<< "${v4}"

while read -r cidr; do
  [[ -z "${cidr}" ]] && continue
  ufw allow from "${cidr}" to any port 80 proto tcp comment "cloudflare-http"
  ufw allow from "${cidr}" to any port 443 proto tcp comment "cloudflare-https"
done <<< "${v6}"

ufw --force delete allow 80/tcp || true
ufw --force delete allow 443/tcp || true
ufw --force delete allow 8080/tcp || true

echo "Website ports are limited to Cloudflare. SSH is unchanged."
ufw status | awk 'NR<=5 || /22\/tcp/ || /Anywhere/ || /8080/'
