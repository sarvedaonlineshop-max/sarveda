# ChatGPT Direct Admin UX Revamp

Scope: admin frontend only. No business logic, backend, API contract, commerce, accounting, checkout, payment, shipping, or storefront behavior changes.

## Why this pass exists

The previous motion pass standardized durations and several primitives, but route navigation still presented a centered spinner over a dimmed previous page. That did not create the connected, structured loading experience the owner expected from products such as Vercel/Zoho.

## Changes in this direct pass

1. Replaced the centered route spinner overlay with a structured admin route skeleton.
   - A 2px progress line appears immediately.
   - The full skeleton waits 110ms, so genuinely fast navigation does not flash a large loader.
   - Skeleton geometry mirrors a common admin page: heading, KPI cards, toolbar, and table rows.
2. Removed the artificial 280ms minimum navigation delay in `AdminNavContext`.
   - Navigation feedback now follows actual route completion.
3. Added admin-wide internal-link observation at `AdminShell` level.
   - Internal `/admin` links from tables/cards/breadcrumbs get the same route feedback, not only sidebar links.
   - Does not prevent navigation or change destinations.
4. Removed dimming of the previous page during route navigation; structured skeleton owns the loading surface.
5. Added tiny 2px sidebar hover translation and aligned it with existing admin motion tokens.
6. Added responsive and reduced-motion behavior for the new route skeleton/progress surface.

## Files changed

- `frontend/components/admin/AdminLoadingOverlay.tsx`
- `frontend/components/admin/AdminNavContext.tsx`
- `frontend/components/admin/AdminShell.tsx`
- `frontend/components/admin/sidebarNavStyles.ts`
- `frontend/app/globals.css`

## Safety boundaries

- `frontend/lib/motion.ts` unchanged.
- `PageTransition.tsx` unchanged and remains disabled.
- Storefront routes/components unchanged.
- No API/fetch/mutation handlers changed.
- No backend or Prisma files changed.

## Expected UX difference

Navigation should now feel immediate while still communicating work: very fast routes show only a brief top progress cue; slower routes transition into a calm structured skeleton instead of a blocking spinner card. This creates perceived continuity without adding route animations or delaying content.
