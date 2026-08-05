# Master ↔ Staging batch sync rules (updated)

Sheet (`data/Sarveda MASTER.xlsx`) is source of truth for:
- Product name
- Variant name
- SKU

## Rules
1. When variant names match → set **DB SKU = Sheet SKU** (never copy DB SKU onto sheet).
2. When sheet has a variant not in DB → **add to DB** with sheet variant name + sheet SKU.
3. After sync, variants that exist **only in DB** → mark **INACTIVE** (draft).
4. Never keep or introduce `woo-var*` SKUs — always use sheet SKU.
5. On any SKU uniqueness conflict → **stop and ask**.
6. Copper bottle family → deferred to last.

## Batch 1 correction
Initial Batch 1 wrongly adapted DB→sheet; corrected to sheet→DB, restored sheet SKUs, drafted DB-only leftovers, replaced `woo-var-46248` with `YO-PYM-S-P`.
