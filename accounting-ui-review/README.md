# Sarveda Native Accounting — UI Review Package

**Purpose:** Read-only source package for external UX/UI redesign of Accounting + Purchases admin.

**Do not** treat this package as a runnable app. Paths mirror the monorepo under `frontend/`.

## Contents

- `frontend/` — page routes, layouts, shared admin shell/components, API clients, types, theme/CSS
- `docs/` — route map, screen inventory, terminology, design system (current state only)
- `screenshots/` — captured screens if available (may be empty if auth blocked)

## Docs

1. `docs/ACCOUNTING_UI_ROUTE_MAP.md`
2. `docs/ACCOUNTING_UI_SCREEN_INVENTORY.md`
3. `docs/ACCOUNTING_UI_TERMINOLOGY.md`
4. `docs/SARVEDA_ADMIN_DESIGN_SYSTEM_CURRENT.md`
5. `docs/FILE_MANIFEST.md`

## Access notes (for reviewers)

- Accounting UI: `NEXT_PUBLIC_ACCOUNTING_ENABLED` + finance email allowlist (`accounting-access.ts`)
- Purchases ops: `NEXT_PUBLIC_PURCHASES_ENABLED`
- Backend posting still gated by separate `NATIVE_ACCOUNTING_*` / posting flags (see route map)

## Exclusions

No `node_modules`, `.next`, `.env`, secrets, PEM keys, customer/payment data, or backend implementation.
