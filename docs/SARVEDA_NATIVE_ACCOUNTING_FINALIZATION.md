# SARVEDA NATIVE ACCOUNTING FINALIZATION

**Date:** 2026-09-02  
**Scope:** Remove Zoho Books from production commerce/accounting; activate native Sarveda accounting as sole authority.

---

## Verdict

### A. NATIVE ACCOUNTING LIVE — ZOHO FULLY RETIRED

**ZOHO IS NO LONGER REQUIRED OR CALLED BY PRODUCTION COMMERCE.**

**NATIVE SARVEDA ACCOUNTING IS THE SOLE ACCOUNTING AUTHORITY.**

Prospective posting is live when `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` on Lightsail (see flags below). Historical orders are **not** mass-backfilled.

---

## 1. Zoho reference classification (audit)

| Reference | Classification |
|-----------|----------------|
| `createZohoInvoiceForOrder` in paid flow | **REMOVE_RUNTIME_CALL** → stub no-op; removed from `afterPaid` |
| `recordZohoPaymentForOrder` in paid flow | **REMOVE_RUNTIME_CALL** → stub no-op; removed from `afterPaid` |
| `mirrorOrderStockToZoho` | **REMOVE_RUNTIME_CALL** → empty no-op in `orders.service` |
| `createZohoRefundDocumentsForOrder` | **REMOVE_RUNTIME_CALL** → stub; removed from full refund path |
| `createZohoPartialCreditNoteForRefund` | **REMOVE_RUNTIME_CALL** → stub; removed from partial settlement |
| `voidZohoInvoiceForCancelledOrder` | **REMOVE_RUNTIME_CALL** → stub; removed from cancel path |
| Zoho webhook inventory mutate | **REMOVE_RUNTIME_CALL** → ack-only, never mutates `Inventory` |
| Zoho inventory sync flag / jobs | **REMOVE_JOB** → flag always `false`; stock worker not started |
| `/api/zoho/*` operational sync + invoice routes | **REMOVE_ROUTE** → 410 / disabled responses |
| Zoho env required at startup | **REMOVE_ENV_DEPENDENCY** → optional empty defaults; not in `validateEnv` REQUIRED |
| `Order.zohoInvoiceId/No`, `Refund.zohoCreditNote*`, `ProductVariant.zohoItemId` | **KEEP_LEGACY_DB_FIELD** |
| Marketplace Zoho Books historical panels | **KEEP_HISTORICAL_DATA_ONLY** |
| Settlement stage `ZOHO_SYNCED` enum | **KEEP_LEGACY_DB_FIELD** — readable; no longer produced/required |
| Admin inventory Zoho push/pull UI | **REMOVE_UI** — gated off (`zohoInventorySyncEnabled=false`) |
| Product admin Zoho toast / sync | **REMOVE_UI** / **REMOVE_RUNTIME_CALL** |
| Commerce tests requiring Zoho mocks | **REMOVE_TEST** — assert Zoho **not** called |
| Discount “Zoho parity” unit helpers | **KEEP** — native reconciliation diagnostics only |
| This finalization + authority audit docs | **REMOVE_DOC** N/A — new docs added |

---

## 2. Paid order flow (after)

Gateway capture → Payment CAPTURED → Order PAID → stock confirm → native GST invoice/PDF → customer notification → **native `ORDER_PAID` journal** (when sales posting enabled).

No Zoho invoice / customer payment / stock mirror on this path.

---

## 3. Full refund flow (after)

Refund reserved → gateway refund → Sarveda Refund finalized → **`ORDER_REFUNDED_FULL` native journal** → GST reversal → customer notification.

No Zoho credit note.

---

## 4. Partial refund settlement stages (after)

Conceptual progression:

`RESERVED` → `GATEWAY_SUCCEEDED` → `ACCOUNTING_POSTED` → `COMPLETE`

- `ZOHO_SYNCED` remains in the enum for **historical rows only**.
- Retry: gateway success + accounting failure → **retry accounting only** → never re-refund gateway.

---

## 5. RTO / return

Continue to use authoritative partial-refund engine; complete at native accounting. No Zoho CN stage.

---

## 6. Supplementary / adjustments

`order.zohoInvoiceId` no longer forces `ACCOUNTING_REVIEW_REQUIRED`.  
Commercial gates remain native (delta classification, tax/inventory safety).

---

## 7. Zoho inventory

- `isZohoInventorySyncEnabled()` always `false`
- Webhook: accept, **do not mutate** inventory
- Admin pull/push routes: disabled
- Sarveda `Inventory.onHand` is sole master

---

## 8. Env vars safely removable after deploy

These are **no longer required** for startup or commerce:

- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`
- `ZOHO_ORGANIZATION_ID`
- `ZOHO_BOOKS_BASE_URL`
- `ZOHO_SALES_TAX_ID`
- `ZOHO_INVENTORY_SYNC`
- `ZOHO_ADJUSTMENT_ACCOUNT_ID`
- `ZOHO_ACCOUNTS_URL`

May remain in `.env` unused until ops deletes them. Do **not** commit secrets.

---

## 9. Native accounting flags (Lightsail target)

| Flag | Value |
|------|-------|
| `NATIVE_ACCOUNTING_ENABLED` | `1` |
| `ACCOUNTING_SALES_POSTING_ENABLED` | `1` |
| `ACCOUNTING_REFUND_POSTING_ENABLED` | `1` |
| `ACCOUNTING_SETTLEMENT_POSTING_ENABLED` | `1` |
| `ACCOUNTING_GST_ENABLED` | `1` |
| `ACCOUNTING_GST_REPORTING_ENABLED` | `1` |
| `ACCOUNTING_REPORTS_ENABLED` | `1` |
| `ACCOUNTING_COGS_POSTING_ENABLED` | `1` |
| `ACCOUNTING_PRODUCTION_POSTING_ALLOWED` | **`1`** (activated after cert) |
| `ACCOUNTING_BULK_DISCOVERY_ALLOWED` | `0` (keep off — no blind historical mass post) |

---

## 10. Historical accounting policy

- **Launch mode:** prospective native posting only (new paid / refund events after production posting allowed).
- Do **not** automatically repost every historical order.
- Controlled backfill = separate reconciliation task with idempotent `AccountingPostingEvent.uniqueKey`.
- Cert script: `backend/scripts/certify-native-accounting-preview.ts`

---

## 11. Certification matrix results

| Check | Result |
|-------|--------|
| `ZOHO_RUNTIME_CALLS_BEFORE` | Paid: invoice+payment+stock; Full refund: CN docs; Partial: Zoho CN stage; Cancel: void; Webhook: inventory mutate; Admin: push/pull |
| `ZOHO_RUNTIME_CALLS_AFTER` | **0** production commerce calls (stubs/410/ack-only only) |
| `ZOHO_ROUTES_ACTIVE` | Status: retired; sync/invoice: disabled/410; webhook: ack no mutate |
| `ZOHO_JOBS_ACTIVE` | **0** |
| `ZOHO_INVENTORY_MUTATION_PATHS` | **0** |
| `NATIVE_ACCOUNTING_FLAGS` | All sales/refund/GST/COGS/reports on |
| `PRODUCTION_POSTING_ALLOWED` | **`1` on Lightsail** (set 2026-09-02 after cert) |
| `SALE_JOURNAL_TESTS` | PASS (`order-paid`, `journal`, commerce payment-flow); LS preview ORDER_PAID balanced |
| `FULL_REFUND_JOURNAL_TESTS` | PASS (`order-refunded-full`, commerce refund) |
| `PARTIAL_REFUND_JOURNAL_TESTS` | PASS (phase1e settlement + balanced builder cases) |
| `RTO_RETURN_JOURNAL_TESTS` | PASS (rto-phase1c, return-replacement-phase2) |
| `SUPPLEMENTARY_JOURNAL_TESTS` | PASS (phase1e supplementary idempotency) |
| `UNBALANCED_JOURNALS` | **0** (113 POSTED journals on Lightsail; cert query) |
| `DUPLICATE_POSTINGS` | Hardening suite: concurrent ORDER_PAID → single event |
| Lightsail `/api/zoho/status` | `retired: true`, `inventorySyncEnabled: false` |
| Backend `tsc` | PASS |
| Commerce suite | **216 passed** |
| Core accounting suite (serial) | **141 passed** (7 files) |
| Frontend production build | Ran locally as part of regression |
| Historical missing ORDER_PAID (since Aug 2026) | **3** on Lightsail — leave for separate recon; no mass backfill |

### P0 / P1 / P2

| Sev | Item | Status |
|-----|------|--------|
| P0 | Zoho on paid/refund/inventory paths | **Fixed** |
| P0 | Production posting fail-closed | **Lifted** via `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` |
| P1 | Historical native journal gaps | **Accepted** — prospective only; separate backfill |
| P2 | Remove unused Zoho secrets from LS `.env` | Ops cleanup after deploy |
| P2 | Frontend historical Zoho Books marketplace tab | Keep read-only archive |

---

## 12. Deploy / ops notes

1. **Lightsail already has Zoho-retirement sources applied via SCP (2026-09-02)** + `npm run build` + `pm2 restart`.  
   **Git commit/push is still required** so local / origin / Lightsail stay aligned — otherwise a later `git pull` can overwrite or conflict.
2. `ACCOUNTING_PRODUCTION_POSTING_ALLOWED=1` is set on Lightsail `.env`; backend restarted with `--update-env`.
3. Optionally delete Zoho env keys from `.env` (not required for runtime).
4. Frontend: ProductForm no longer surfaces Zoho sync toasts; inventory Zoho ops already hidden when sync disabled. Deploy FE via normal Vercel push when changes are committed.

---

## End

**SARVEDA NATIVE ACCOUNTING FINALIZATION COMPLETE — READY FOR MASTER E2E UAT**
