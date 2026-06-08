# Sarveda RTM status — June 2026 (demo / pre-launch)

**Source file:** `Sarveda-RTM-v1.1-audited.csv` (updated via `python3 scripts/update-rtm-jun-2026.py`)  
**Previous snapshot:** `scripts/update-rtm-may-2026.py` (May 2026)  
**Staging:** https://sarveda-demo.xyz  
**Regenerate Excel:** `python3 scripts/generate-rtm-v1.1.py` (after CSV update)

---

## Executive summary

| Scope | Count | % |
|--------|------:|---:|
| **Total requirements** | 135 | 100% |
| **Dev Complete** | 91 | **67%** ↑ from 56% |
| **Dev In Progress** | 18 | 13% |
| **Dev Deferred** (WATI etc.) | 5 | 4% |
| **Dev Not Started** | 21 | **16%** ↓ from 30% |
| **Incomplete (NS + IP + Deferred)** | 44 | **33%** ↓ from 44% “left” on stale CSV |
| **Test Pass** | 74 | 55% |
| **Must Have — Dev Complete/Deferred** | 82 / 102 | **80%** ↑ from 71% |
| **Must Have — Test Pass** | 68 / 102 | 67% |

**Shop + checkout (revenue path):** ~**95%** dev complete; **~85%** tested on demo.

**Full launch parity (SEO cutover, WATI, LMS, Zoho E2E):** ~**15–20%** still open — mostly ops + Phase 2.

---

## Completed in Jun 2026 sprint (newly marked in RTM)

| REQ | Area |
|-----|------|
| AUTH-003 | Password reset (email + token) |
| PROD-010 | Reviews API, PDP, admin moderation |
| PROD-014 | HSN on products + GST invoice lines |
| CART-005 | Free shipping progress bar |
| CART-010 | GST breakdown at checkout + confirmation |
| PAY-008 | Gateway refunds (Razorpay/Stripe/PayPal) |
| ORD-008 | Admin cancel + refund |
| ORD-011 | RTO handling (Shiprocket webhook) |
| NOT-011 | BullMQ email queue |
| MKT-001 / MKT-002 | GA4 + Meta Pixel (production-gated) |
| ADM-004 / 005 / 006 / 007 | Inventory+Zoho UI, customers, coupons, reports |

**Shipping / infra (In Progress, not Complete):** AWB retry + error logging, `test-shipping.ts`, nginx config for `api.sarveda-demo.xyz` (deploy pending).

**Zoho (In Progress, was 0/8 Complete):** Invoices on paid, stock pull/push, sync jobs, contacts, admin out-of-sync UI — **4/8 In Progress**, 4 still Not Started (AWB sync, refund to Books, RTO stock).

---

## Completed since v1.1 audit (high confidence)

### E-commerce core ✅
- 169 products, variants, cart, checkout, guest + logged-in cart
- Razorpay, Stripe, PayPal, COD
- Coupons at checkout + **admin coupon CRUD**
- Order confirmation, payment failed, resume order
- Stock reserve / 15 min timeout
- Geo pricing INR / USD / GBP
- GST invoice PDF + **HSN + checkout GST row**
- SendGrid order emails + **BullMQ retry queue**
- Manual + automated AWB path (router; live E2E sign-off pending)
- **Refunds + RTO** in admin

### Catalog & media ✅
- Audio, galleries, variant labels, latest CSV

### UX & navigation ✅
- Mobile nav, header, PDP Amazon layout, homepage rails
- **GA4 / Meta Pixel**, **free shipping bar**, **reviews on PDP**

### Courses, events, insights ✅ (listing + pay — not full LMS)
- Enroll/register via cart; profile lists; corporate pages

---

## In progress 🟡 (18 rows)

| Area | Examples | What’s left |
|------|----------|-------------|
| Shipping E2E | SHIP-001–003 | Live Delhivery/Shiprocket AWB on EC2 |
| Zoho | ZOHO-001–003, 006–007 | Prod credentials + E2E; AWB/refund/RTO sync |
| SEO launch | MKT-005 | 301 map from GSC, 22 sitemaps, sarveda.com cutover |
| Infra | INF-006, INF-007 | Apply nginx + SSL on EC2 |
| Course portal | CRS-002, CRS-003, CRS-007 | Lesson player, Zoom email |
| Search filters | PROD-013 | Advanced PLP filters |
| Abandoned cart | CART-011 | Email ✅; WhatsApp deferred |
| Admin UX | ADM-010 | Mobile polish |

---

## Deferred / out of scope (client) ⏸

| Item | RTM |
|------|-----|
| **WATI / WhatsApp** all events | NOT-006–009, NOT-012 → **Deferred** |

---

## Not started (21 rows — Phase 2 / nice-to-have)

- AUTH-006, AUTH-007 — RBAC, session timeout
- PROD-015–018 — artisan story, video, wishlist, bulk CSV
- PAY-010, PAY-011 — currency switcher UI, EMI
- CRS-004–006 — Zoom delivery, video LMS, certificates
- ADM-008, ADM-009, ADM-011 — GST export, low-stock alerts, RBAC
- MKT-006 — referral program
- UX-006–008 — PWA, animations, cursor
- ZOHO-004, 005, 008 — AWB sync, refund in Books, RTO stock in Zoho

---

## Recommended next (priority order)

1. **Launch week:** GSC → 301 redirects → `sarveda.com` DNS + production webhooks  
2. **EC2:** `check-env.ts` → `run-migrations.sh` → nginx + certbot → `pm2 restart`  
3. **Shipping:** One live AWB E2E (India + intl)  
4. **Zoho:** Prod OAuth + paid order → invoice/sales order sign-off  
5. **Phase 2:** Wishlist, GST export, LMS, insights `?cat=` filter  

---

*Updated Jun 2026 — reflects `update-rtm-jun-2026.py` on codebase.*
