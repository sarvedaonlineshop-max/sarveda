# Sarveda API — nginx Setup

## Current setup (sarveda-demo.xyz)

This config covers `api.sarveda-demo.xyz` only.
`sarveda.com` will be added on cutover day.

## Steps

### 1. Install nginx

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Copy config

```bash
sudo cp nginx/sarveda-api.conf /etc/nginx/sites-available/sarveda-api
sudo ln -s /etc/nginx/sites-available/sarveda-api /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### 3. Test and reload

```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 4. Add DNS A record (in your domain registrar)

`api.sarveda-demo.xyz` → `13.206.192.106`

Wait 5 mins for propagation, then verify:

```bash
nslookup api.sarveda-demo.xyz
```

### 5. Issue SSL certificate

```bash
sudo certbot --nginx \
  -d api.sarveda-demo.xyz \
  --email your@email.com \
  --agree-tos \
  --non-interactive
```

### 6. Test HTTPS

```bash
curl https://api.sarveda-demo.xyz/health
```

### 7. Enable auto-renew

```bash
sudo systemctl enable certbot.timer
sudo certbot renew --dry-run
```

---

## On cutover day (adding sarveda.com)

Edit `/etc/nginx/sites-available/sarveda-api`

Change `server_name` line to:

```
server_name api.sarveda-demo.xyz api.sarveda.com;
```

Then re-run certbot:

```bash
sudo certbot --nginx -d api.sarveda-demo.xyz -d api.sarveda.com
sudo nginx -t && sudo systemctl reload nginx
```
