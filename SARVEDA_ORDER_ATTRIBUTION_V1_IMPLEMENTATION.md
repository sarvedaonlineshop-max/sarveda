# SARVEDA ORDER ATTRIBUTION — V1 IMPLEMENTATION

**Date:** 2026-08-28  
**Status:** COMPLETE — READY FOR UAT  
**Reference:** `SARVEDA_ORDER_ATTRIBUTION_AUDIT.md` (approved)

---

## Checklist

### A. Prisma model added
**PASS.** `OrderAttribution` 1:1 with `Order` (`orderId` unique, `onDelete: Cascade`). Fields match V1 spec (first/last touch, UTMs, click IDs, device, session page views, timestamps). Indexes on `sourceType`, `utmCampaign`, `capturedAt`.

### B. Migration created
**PASS.** Additive migration only:  
`backend/prisma/migrations/20260828120000_order_attribution/migration.sql`  
No drops, no order rewrites, no backfill. Historical orders simply have no row.

### C. AttributionProvider added
**PASS.** `frontend/components/attribution/AttributionProvider.tsx` mounted under `CartProvider` in `frontend/app/layout.tsx`. Skips `/admin`, `/api`, `/complaints` via `isAttributionTrackedPath`. Independent of GA4/Meta scripts.

### D. First touch implemented
**PASS.** First-party cookie `sarveda_attr_ft` (~90 days). Set once on first storefront landing; not overwritten by internal SPA navigation.

### E. Last touch implemented
**PASS.** Session state `sarveda_attr_session`. Updates only on external referrer, UTM params, or `gclid`/`fbclid`. Internal product → cart → checkout does not reset to Direct/self-referral.

### F. Source classification implemented
**PASS.** Deterministic classifier in `backend/src/modules/attribution/source-classifier.ts` and mirrored in `frontend/lib/attribution/classifier.ts`. Priority: paid → email → social → organic → referral → direct → other.

### G. Session page views implemented
**PASS.** ~30-minute inactivity boundary; pathname-based storefront page views; sessionStorage dedupe to avoid React Strict Mode double-count. Not full clickstream.

### H. Device detection implemented
**PASS.** Server-side UA classification at create-order (`DESKTOP` | `MOBILE` | `TABLET` | `OTHER`) via `classifyDeviceFromUserAgent`. Client device enum is not trusted when UA is present.

### I. URL/privacy sanitization implemented
**PASS.** Landing URLs keep pathname + approved attribution query keys only; referrers strip query/hash; fields truncated; HTML stripped. Backend re-sanitizes before persist. Admin UI renders as text only.

### J. create-order integration implemented
**PASS.** Optional `attribution` on `POST /api/checkout/create-order`. Soft-parsed (`z.unknown()` + sanitize). Persist inside order-create transaction. Missing/invalid attribution never fails checkout.

### K. Resume no-overwrite verified
**PASS.** `resumePendingCheckout` does not touch `OrderAttribution`. Test confirms same row/`updatedAt` after resume.

### L. Payment/webhooks unaffected
**PASS.** No attribution writes in verify/webhook paths. Test: `completePaidOrder` does not mutate attribution.

### M. Admin Order Attribution card added
**PASS.** Admin GET `/api/admin/orders/:id` includes `attribution`. UI card on `/admin/orders/[id]` near totals/payment. Technical details (gclid/fbclid/raw referrer) collapsed. No edit API.

### N. Historical orders handled
**PASS.** Null attribution → “Attribution was not captured for this order.” No GA/Meta/Woo inference.

### O. GA4 unaffected
**PASS.** Existing gtag init in root layout unchanged; attribution does not call `gtag`.

### P. Meta Pixel unaffected
**PASS.** Existing `fbq` init unchanged; attribution does not call `fbq`.

### Q. Commerce logic changed outside attribution
**NO** material commerce changes. Only optional attribution payload + informational persist. Totals, stock, payment method selection, gateways unchanged.

### R. Accounting changed
**NO.** No accounting models, journals, GST, or settlement paths modified.

### S. Tests
**PASS (executed).**
- `npx vitest run test/commerce/attribution-classifier.test.ts` — Direct, organic, ChatGPT, social, UTM/paid/email/gclid/fbclid, sanitize, device
- `npx vitest run test/commerce/attribution-checkout.test.ts` — persist, missing, malformed, resume no-overwrite, new snapshot, payment no-mutate, admin/historical
- `npx vitest run test/commerce/checkout.test.ts` — existing checkout still green

### T. TypeScript
**PASS (executed).**
- Backend: `npx tsc -p tsconfig.json --noEmit` exit 0
- Frontend: `npx tsc -p tsconfig.json --noEmit` exit 0

### U. Build
**PASS (executed).** Frontend `npm run build` exit 0.

### V. Migration / deployment instructions

**Order of operations (staging then production):**

1. Deploy backend with migration applied **before** relying on create-order attribution writes:
   ```bash
   cd backend && npx prisma migrate deploy && npm run build && pm2 restart sarveda-backend
   ```
2. Deploy frontend (Vercel) so `AttributionProvider` + checkout payload ship together.
3. Smoke UAT:
   - Land via external referrer or UTM → browse → checkout → create unpaid order → confirm Admin Order Attribution card
   - Resume unpaid order → attribution unchanged
   - Historical order without row → empty state
4. No data backfill required.

**Rollback:** Dropping the feature is optional; leaving empty `OrderAttribution` table is safe. Do not delete the table while code expects the model without a matching rollback deploy.

### W. Remaining limitations
- No Orders list “Source” column / filters (deferred)
- No multi-touch path / clickstream
- No bot flagging; staff test traffic included
- First-touch cookie blocked by some privacy browsers → order may lack attribution (checkout still succeeds)
- Client session page views are approximate (SPA + 30m idle)
- Classification rules are heuristic and may need expansion (new social hosts, etc.)
- No enrichment from Google Ads / Meta APIs
- WooCommerce historical attribution not imported

---

## Key files

| Area | Path |
|------|------|
| Schema | `backend/prisma/schema.prisma` |
| Migration | `backend/prisma/migrations/20260828120000_order_attribution/` |
| Classifier / sanitize / device / persist | `backend/src/modules/attribution/` |
| Checkout | `backend/src/modules/checkout/schemas.ts`, `checkout.service.ts` |
| Admin API | `backend/src/modules/admin/admin.handlers.ts` |
| FE provider / libs | `frontend/components/attribution/`, `frontend/lib/attribution/` |
| Checkout send | `frontend/lib/checkout-api.ts` |
| Admin UI | `frontend/components/admin/AdminOrderAttributionCard.tsx`, `frontend/app/admin/orders/[id]/page.tsx` |

---

SARVEDA ORDER ATTRIBUTION V1 IMPLEMENTATION COMPLETE — READY FOR UAT
