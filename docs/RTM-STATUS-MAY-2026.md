# Sarveda RTM status — May 2026 (demo / pre-launch)

**Source file:** `Sarveda-RTM-v1.1-audited.csv` (updated via `python3 scripts/update-rtm-may-2026.py`)  
**Staging:** https://sarveda-demo.xyz  
**Regenerate Excel:** `python3 scripts/generate-rtm-v1.1.py` (after CSV update)

---

## Executive summary

| Scope | Count | % |
|--------|------:|---:|
| **Total requirements** | 135 | 100% |
| **Dev Complete** | 76 | **56%** |
| **Dev In Progress** | 13 | 10% |
| **Dev Deferred** (WATI etc.) | 5 | 4% |
| **Dev Not Started** | 41 | 30% |
| **Test Pass** | 73 | **54%** |
| **Must Have — Dev Complete/Deferred** | 72 / 102 | **71%** |
| **Must Have — Test Pass** | 67 / 102 | **66%** |

**Shop + checkout (revenue path):** ~**92–95%** dev complete; **~85%** tested on demo (Razorpay, Stripe, PayPal, coupons, invoice, AWB manual, emails).

**Full launch parity (SEO, Zoho, WATI, course portal, reviews):** ~**25–30%** still open — mostly **post-demo / launch week**.

---

## Completed since v1.1 audit (high confidence)

### E-commerce core ✅
- 169 products, variants, cart, checkout, guest + logged-in cart (merge fix)
- Razorpay, Stripe, PayPal tested on demo
- COD path implemented
- Coupons at checkout (WELCOME10 verified)
- Order confirmation, payment failed, resume order
- Stock reserve / 15 min timeout
- Geo pricing INR / USD / GBP (middleware + shop/PDP)
- GST invoice PDF on paid orders
- SendGrid order emails working
- Manual AWB generation in admin

### Catalog & media ✅
- Audio samples on ~38 products (sync:audio + media XML)
- Product galleries, variant labels import
- Latest products CSV in use

### UX & navigation ✅
- Mobile bottom nav (Home, Search, Cart, You) — Chat link removed from tab bar
- Full header nav: Courses, Events, Corporate Wellness, Insights
- Mobile hamburger menu + sign out fix
- Password show/hide on login/signup
- Homepage: featured products + **courses / events / insights** rails
- PDP Amazon-style layout, cart rail, cart order fix

### Courses, events, insights ✅ (listing + pay — not full LMS)
- `/courses`, `/events`, `/insights` — **full-image cards**, upcoming/past sections
- `/course/[slug]`, `/event/[slug]` — hero banners, enroll/register via cart
- Digital checkout (no shipping on course/event-only carts)
- Enrollment + Booking records after payment (logged-in user)
- Profile → Courses & events list
- Corporate wellness + SAHYOG/SARGAM/SAMATVA/SAMSARA program pages

---

## In progress 🟡

| Area | REQ examples | What’s left |
|------|----------------|-------------|
| Shipping E2E | SHIP-001–003 | Auto-courier + live Delhivery/Shiprocket sign-off |
| Course purchase | CRS-002, CRS-003 | Lesson player, full student portal, Zoom email |
| SEO launch | MKT-005 | 301 map from GSC, 22 sitemaps, sarveda.com cutover |
| GST line items | CART-010, PROD-014 | Checkout GST breakdown + HSN on products |
| Admin | ADM-004–011 | Coupons UI in admin, reports, RBAC |
| Search filters | PROD-013 | Advanced PLP filters |

---

## Deferred / out of scope (client May 2026) ⏸

| Item | RTM |
|------|-----|
| **WATI / WhatsApp** all events | NOT-006–009, NOT-012 → **Deferred** |
| **Zoho** sync | ZOHO-001–008 → external / not in repo |
| Chat mobile tab | Removed from nav; `/chat` route kept |

---

## Not started (launch or Phase 2) ⬜

- Password reset email flow (AUTH-003)
- Reviews on PDP (PROD-010)
- Wishlist (PROD-017)
- Refunds via gateway (PAY-008)
- Abandoned cart automation (CART-011)
- Google Analytics / Meta pixel (MKT-001, MKT-002)
- Production SSL api subdomain (INF-006, INF-007)
- Course certificates, pre-recorded LMS (CRS-005, CRS-006)
- Insights category filter `?cat=` (needs WP categories export)

---

## New RTM rows added (May 2026)

| REQ ID | Description |
|--------|-------------|
| REQ-EVT-001 | Events listing (upcoming/past, full-image cards) |
| REQ-INS-001 | Insights listing (full-image blog cards) |
| REQ-UX-010 | Main nav Courses / Events / Corporate / Insights |
| REQ-UX-011 | Password visibility toggle |
| REQ-UX-012 | Sign out works on all pages |

---

## Recommended next (priority order)

1. **Launch week:** GSC → 301 redirects → `sarveda.com` DNS + production webhooks  
2. **Shipping:** One automated AWB path E2E (optional `AUTO_START_FULFILLMENT_ON_PAID`)  
3. **Courses:** `import:courses` re-run for teacher names on cards; lesson curriculum XML when ready  
4. **Phase 2:** Reviews, password reset, admin coupon UI, insights categories  

---

*Updated for Arjun / Shivakumar — May 2026 demo sprint.*
