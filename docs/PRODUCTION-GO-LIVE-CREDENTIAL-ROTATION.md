# Production go-live — credential rotation checklist

**Created:** 2026-07-26  
**Remind / run:** ~**2026-08-05** (≈10 days after staging Lightsail DB cutover)  
**When:** Quiet 30–60 min window before public DNS cutover to `sarveda.com`  
**Rule:** Do **not** paste secrets into Cursor chat. Edit on Lightsail / Vercel / provider consoles only.

Related: [`LAUNCH-REQUIREMENTS.md`](./LAUNCH-REQUIREMENTS.md) · security rule `.cursor/rules/security-hardening.mdc`

---

## Before you start

- [ ] Quiet window booked
- [ ] Lightsail SSH + Vercel + AWS consoles open
- [ ] Staging still healthy: `https://sarveda-demo.xyz` shop + `/health`
- [ ] After each group below: smoke-test shop + admin + one payment path if touched

---

## 1. Accounts (first — no app downtime)

- [ ] GitHub: **2FA**; remove unused collaborators
- [ ] Vercel: **2FA**; check team access
- [ ] AWS root: **2FA**; stop using root for daily work
- [ ] Prefer limited IAM user for S3 (not root keys)
- [ ] Zoho / Razorpay / Stripe / PayPal / SendGrid / WATI / MSG91: **2FA** where available

---

## 2. Database (Lightsail Postgres)

- [ ] Lightsail DB → change master password
- [ ] Update `DATABASE_URL` on Lightsail `~/sarveda/backend/.env`
- [ ] `pm2 restart sarveda-backend --update-env`
- [ ] `/health` → `database: ok`
- [ ] Admin login + product list OK

---

## 3. App auth secrets

- [ ] New `JWT_SECRET` (32+ random chars)
- [ ] Same value on Lightsail backend `.env` and frontend/`JWT` env if used for admin cookies
- [ ] Restart backend + redeploy frontend
- [ ] Expect: all users/admins must **log in again**

---

## 4. AWS / S3

- [ ] New IAM access key (least privilege: `sarveda-media` + complaints bucket only)
- [ ] Update Lightsail: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_REGION=us-east-1`, `AWS_S3_BUCKET_NAME`
- [ ] Disable/delete **old** IAM access key
- [ ] Test one admin media upload

---

## 5. Payments (test keys first, then live)

### Razorpay (India)
- [ ] Rotate Key ID / Secret (or new live keys)
- [ ] Rotate **webhook secret**
- [ ] Update Lightsail `.env` + Vercel `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- [ ] Webhook URL: `https://sarveda.com/api/payments/razorpay/webhook` (prod host)
- [ ] One paid order → status **PAID**

### Stripe (intl)
- [ ] Rotate secret + publishable + webhook secret
- [ ] Update env + webhook endpoint

### PayPal
- [ ] Rotate client id/secret; `PAYPAL_MODE=live` only when ready

---

## 6. Google OAuth

- [ ] Rotate client secret (or new OAuth client for production domain)
- [ ] Redirect: `https://sarveda.com/api/auth/google/callback`
- [ ] Update `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL`
- [ ] Test Google login (storefront ± admin)

---

## 7. Email / SMS / WhatsApp

- [ ] SendGrid: rotate API key → `SENDGRID_API_KEY`
- [ ] MSG91: rotate auth key / OTP template if used
- [ ] WATI: rotate API key
- [ ] One OTP + one order email test

---

## 8. Shipping (when live)

- [ ] Rotate Shiprocket / Delhivery credentials
- [ ] Update `.env`; one test shipment / serviceability check if enabled

---

## 9. Zoho

- [ ] Refresh / rotate OAuth tokens / client secret as required
- [ ] Confirm inventory sync after restart

---

## 10. SSH / server

- [ ] Only your Lightsail `.pem` works; `chmod 400`
- [ ] Firewall: SSH not `0.0.0.0/0` if possible (your IP)
- [ ] If key was ever shared/copied into chat: new keypair, remove old
- [ ] Never commit `.pem` or `.env`

---

## 11. Production URLs / CORS

- [ ] `FRONTEND_URL=https://sarveda.com`
- [ ] `CORS_ORIGINS` = real frontends only (no `*`)
- [ ] `NEXT_PUBLIC_SITE_URL` / API URLs point at production
- [ ] `NODE_ENV=production`
- [ ] Redeploy Vercel + restart PM2

---

## 12. Cleanup after live

- [ ] Delete old RDS **final snapshot** after 2–4 weeks confidence
- [ ] Release unused Elastic IPs / orphan EBS volumes
- [ ] Remove unused Vercel preview secrets
- [ ] Confirm dumps / `.env` / `.pem` not in git (`backups/`, `*.dump` gitignored)

---

## Go-live smoke test

1. Homepage + PDP (S3 images)
2. Signup / login / Google login
3. Cart → checkout → Razorpay success
4. Admin → orders
5. Webhook leaves order **PAID**
6. `/health` → database + redis ok

---

## If time is short (minimum before public launch)

1. DB password  
2. `JWT_SECRET`  
3. Razorpay + webhook secret  
4. AWS S3 keys  
5. Google OAuth  
6. 2FA on GitHub / Vercel / AWS  

---

## Infra note (Jul 26, 2026 staging)

- Frontend: **Vercel** (`sarveda-demo.xyz`)
- API: Lightsail `sarveda-api-lightsail` → `13.204.112.165`
- DB: Lightsail managed Postgres **18.x** (`sarveda_master_db` instance; app DB `sarveda_db`)
- Media: S3 `sarveda-media` (us-east-1)
- Old RDS/EC2: decommissioned / being cleaned up — do not point prod back at them
