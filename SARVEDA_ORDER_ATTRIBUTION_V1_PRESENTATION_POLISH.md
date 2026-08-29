# SARVEDA ORDER ATTRIBUTION V1 — PRESENTATION POLISH

**Date:** 2026-08-28  
**Scope:** Admin Order Attribution card display only  
**No changes to:** capture, cookies, session, schema, APIs, checkout, GA4, Meta, payments, accounting

## Changes

File: `frontend/components/admin/AdminOrderAttributionCard.tsx`

1. **Source / Medium humanized**
   - `(direct) / (none)` → **Direct**
   - `google.com / organic` → **Google / Organic Search**
   - `facebook.com` / `instagram.com` / `bing.com` / known social & search hosts mapped when confidently identifiable
   - Unknown sources: show cleaned hostname or omit invented brands

2. **First / Last touch layout**
   - Primary line: humanized source (e.g. Direct, Google / Organic Search)
   - Secondary: `Landing page: …`
   - Subtle hints:
     - First: “How the customer originally discovered Sarveda.”
     - Last: “The customer's most recent source before this order.”

3. **Technical / Marketing details**
   - Expanded to include raw first/last source·medium, UTMs, referring domain, raw landings, click IDs

4. **Preserved fields:** Origin, Source type, Source / Medium, Landing page, Device, Session page views, First touch, Last touch (Campaign still shown when present)

## Validation

| Case | Result |
|------|--------|
| Direct visit | Source / Medium & touches show **Direct**; landing separate |
| Google Organic | **Google / Organic Search** |
| Mobile / Desktop | Unchanged device labels |
| First ≠ Last | Independent humanized blocks |
| Historical (no attribution) | Empty state unchanged |
| TypeScript | **PASS** — `npx tsc -p tsconfig.json --noEmit` |
| Production build | **PASS** — `npm run build` |
| Humanizer spot checks | Direct, Google/Organic, Facebook, Instagram, Bing → **PASS** |

---

SARVEDA ORDER ATTRIBUTION V1 COMPLETE
