# SARVEDA GLOBAL MOTION SYSTEM — PHASE 1 AUDIT (READ-ONLY)

**Date:** 2026-08-29  
**Scope:** Frontend interaction & motion only  
**Code changes:** **NONE**

Desired language: **fast · subtle · premium · calm · responsive · professional**  
Not: flashy · bouncy · game-like · slow · over-animated · distracting

---

## Executive answers

| Question | Answer |
|----------|--------|
| **CAN SARVEDA HAVE ONE SHARED MOTION SYSTEM?** | **YES** |
| **IS A NEW MOTION LIBRARY REQUIRED?** | **NO** |
| **CAN MOST MOTION BE IMPLEMENTED THROUGH SHARED PRIMITIVES?** | **YES** (after consolidating a few missing primitives — Button, Modal, Toast) |
| **IS GLOBAL PAGE TRANSITION RECOMMENDED?** | **NO** — keep disabled; admin utility navigation must feel instant; storefront previously had route-remount risks |
| **IS PREFERS-REDUCED-MOTION CURRENTLY SUPPORTED?** | **YES** (CSS global) / **PARTIAL** (Framer paths honor it; many admin modals/toasts do not animate yet so they are fine by omission) |
| **READY FOR MOTION IMPLEMENTATION?** | **YES** |

---

## 1. Current motion architecture

Sarveda already has a **hybrid** stack:

| Layer | Role |
|-------|------|
| **CSS / Tailwind** | Dominant — ~260 `transition-*` hits across ~99 files; base micro-transitions on all `a`/`button` |
| **`globals.css` keyframes** | Storefront hero/marquee, payment success/fail, contact page, admin micro-pops |
| **`framer-motion`** | Drawers (`SlideDrawer`, shop category drawer), optional page transition (**disabled**), admin dashboard card entrance |
| **`lib/motion.ts`** | Shared durations/variants for Framer only |
| **React `useTransition`** | Concurrent rendering in Header (not visual animation) |
| **`requestAnimationFrame`** | Gallery / scroll / measurement utilities |

There is **no** Radix, Headless UI, React Transition Group, GSAP, or Lottie in `frontend/package.json`.

---

## 2. Existing libraries

| Library | Installed | Used for |
|---------|-----------|----------|
| `framer-motion` `^12.38.0` | **Yes** | Drawers, MotionConfig, disabled PageTransition, admin dashboard |
| `motion` (Motion One package) | No | — |
| `@radix-ui/*` | No | — |
| `@headlessui/*` | No | — |
| `react-transition-group` | No | — |
| `tailwindcss-animate` | No | — |

**Verdict:** Motion is **primarily CSS/Tailwind**, with Framer reserved for **spatially meaningful panels**.

---

## 3. Existing shared primitives

| Primitive | Status | Location / notes |
|-----------|--------|------------------|
| Button | **LOCAL/DUPLICATED** | No design-system `Button`; hundreds of inline `<button>` + Tailwind |
| Modal / Dialog | **PARTIALLY SHARED** | `AdminConfirmModal`; many one-off modals (pickup, track, order info, EWB drawer-like overlays) |
| Drawer / Sheet | **SHARED ALREADY** | `components/ui/SlideDrawer.tsx` (Framer) |
| Tabs | **LOCAL/DUPLICATED** | Page-local patterns |
| Dropdown / menu | **LOCAL/DUPLICATED** | e.g. `AdminProfileMenu` |
| Card | **LOCAL/DUPLICATED** | Domain cards (`ProductCard`, accounting cards, etc.) |
| Toast | **PARTIALLY SHARED** | `AdminToast` + many page-local fixed toasts (orders, etc.) — **no enter/exit motion** |
| Accordion | **PARTIALLY SHARED** | Storefront `AccordionDescription`; admin rich editor; accounting nav collapses |
| Skeleton | **PARTIALLY SHARED** | `ShopProductsSkeleton`; accounting pulse placeholders |
| Sidebar | **SHARED ALREADY** (structure) | `AdminShell` + `AdminSidebar`; mobile slide only |
| Motion tokens | **PARTIALLY SHARED** | `lib/motion.ts` (Framer seconds) ≠ CSS `180ms` base |

`components/ui/` contains **only**: `SlideDrawer`, `HorizontalSnapRow`.

---

## 4. Inconsistencies (summary)

1. **Two timing languages:** Framer `0.18 / 0.24 / 0.32s` vs CSS base `180ms` vs ad-hoc `0.15s` / `0.2s` / Tailwind `duration-*`.
2. **AdminConfirmModal** mounts/unmounts with **zero** backdrop/panel transition; **SlideDrawer** is polished Framer.
3. **Toasts** appear/disappear abruptly (no opacity/translate).
4. **Payment / contact** surfaces use richer keyframe suites; admin is mostly color hover.
5. **PageTransition** exists but is **off** — good; risk if re-enabled naively.
6. **`transition-all`** (~23 uses) is broader than needed (can be costlier than property-limited transitions).
7. Tailwind config defines `animate-fade-up` etc., but many storefront effects are duplicated as CSS classes in `globals.css`.
8. No shared **active/press** scale convention on buttons.
9. Accordion/nav open often **instant height swap** (accounting nav) with only chevron rotation animated.

---

## 5. Buttons

**Findings**
- Global base in `globals.css`: color/background/border/opacity/shadow over **180ms ease-out** on all buttons/links.
- Tailwind often adds `hover:bg-*`, `disabled:opacity-50`, `transition-all` on admin action pills.
- Loading: mix of label swap (“Saving…”) and `animate-spin` icons — inconsistent.
- Danger / primary / secondary are **visual class conventions**, not typed variants.

**Opportunity (without editing hundreds of screens)**
- Extend **base CSS** for `button:active:not(:disabled)` subtle `transform: scale(0.98)` + honor `prefers-reduced-motion`.
- Introduce a thin shared `Button` later for primary surfaces; not mandatory for Phase 2 if CSS layer covers press/hover.
- Standardize loading via shared `Button` or a tiny `Spinner` class.

---

## 6. Navigation / links

| Surface | Motion today |
|---------|--------------|
| Admin sidebar links | Color/background ~150ms |
| Accounting nested nav | Chevron rotate 150ms; panel open/close **instant** |
| Storefront Header / BottomNav | Tailwind color/opacity transitions |
| Breadcrumbs / back links | Mostly static text links |
| Pagination | Instant page change (correct for utility) |

**Recommendation:** Keep link color transitions; add consistent chevron rotation wherever sections expand; do **not** animate full-page nav delays.

---

## 7. Sidebar

**Admin (`AdminShell`)**
- Mobile: `transform` 0.2s slide-in; backdrop **no fade** (conditional render).
- Desktop: fixed 240px — **no collapse/width animation**.
- Nested accounting sections: chevron rotation only.

**Recommendation**
- Backdrop opacity fade (fast).
- Keep slide for mobile drawer.
- Nested sections: optional short max-height/opacity **or** accept instant content with chevron-only (calmer for dense accounting).
- Do **not** redesign sidebar IA.

---

## 8. Pages / route transitions

`PageTransition.tsx`: `ENABLE_PAGE_TRANSITIONS = false`.

Comments document prior harm: AnimatePresence `mode="wait"` could leave shop/PDP stuck on Suspense.

**Recommendation:** **Do not enable global page transitions** for admin or shop browse. If storefront marketing pages ever need entrance, use **per-page CSS opacity only** (≤180ms), never `wait` mode across App Router boundaries.

---

## 9. Cards / panels

- Storefront product/course/event cards: hover translate/shadow common; shop reveal via CSS.
- Admin dashboard: Framer entrance on KPI cards (`admin/page.tsx`).
- Accounting/document cards: mostly static; hover sometimes on interactive rows only.

**Recommendation:** Animate **interactive** cards only. Static KPI/document panels: no perpetual hover lift. Soften dashboard Framer entrance to tokenized fade (or CSS) for consistency.

---

## 10. Modals / dialogs

| Implementation | Open/close motion |
|----------------|-------------------|
| `AdminConfirmModal` | None (hard mount) |
| Order detail / EWB overlays | None / CSS only |
| Pickup / track / order info modals | Local, generally abrupt |
| `SlideDrawer` | Framer overlay + panel |

**Recommendation:** One shared `AdminModal` (or enhance `AdminConfirmModal`): backdrop opacity, panel `opacity + scale(0.98→1)`, **exit ≤150ms**. No dramatic zoom. Reuse for confirmations and form dialogs.

---

## 11. Drawers / side panels

**Gold standard already:** `SlideDrawer` + `lib/motion` drawer variants (full-width translate + overlay fade; reduced-motion → duration 0).

Shop mobile category drawer: same Framer pattern.

**Recommendation:** Route all new drawers through `SlideDrawer`. Align duration tokens with CSS (`fast`/`normal`).

---

## 12. Dropdowns / selects / popovers

- Native `<select>`: browser default.
- Custom menus (`AdminProfileMenu`, action menus): open state often boolean with little/no enter animation.
- Tooltips: sparse.

**Recommendation:** Optional small `opacity + translateY(4px)` on custom menus only; keep native selects alone. Prefer CSS; Framer optional.

---

## 13. Accordions / collapsible sections

| Area | Behavior |
|------|----------|
| Product `AccordionDescription` | Details/summary + CSS |
| Accounting nav groups | Instant children; chevron rotates |
| “Technical details” `<details>` | Base CSS rotates summary SVG |

**Height-jump:** Present on accounting nav. Acceptable for dense ops UI if chevron communicates state. Optional shared accordion with grid/`overflow` technique later — not Phase-1 blocking.

---

## 14. Tabs

Local admin/storefront tab UIs: immediate content swap (correct).

**Recommendation:** Transition **active indicator / color only** (≤150ms). No content fade that delays reading tables.

---

## 15. Tables

- Row hover: background color transitions common.
- Pagination / sort / filter: instant (correct).
- Avoid row stagger animations.

**Recommendation:** Keep hover color; ensure sticky headers don’t fight transitions; no row entrance animations.

---

## 16. Forms

- Focus: global forest `outline` (good).
- Validation: mostly static error text.
- Checkboxes/radios: native + Tailwind.
- Save actions: busy flags / disabled opacity.

**Recommendation:** Subtle error text opacity; optional border-color transition on invalid. **No shake** by default. Loading on submit buttons via shared spinner/opacity.

---

## 17. Loading states

| Pattern | Usage |
|---------|-------|
| `animate-spin` | Buttons, route spinner |
| `animate-pulse` | Skeletons |
| Text “Loading…” | Many admin fetches |
| `RouteLoadingSpinner` | Storefront chrome |

**Gaps:** Layout shift when skeletons missing; inconsistent spinner size/color.

**Recommendation:** Shared `Spinner` + `Skeleton` tokens; prefer skeletons for list/table first paint.

---

## 18. Notifications / success / error

| Pattern | Motion |
|---------|--------|
| `AdminToast` | Instant appear/disappear |
| Inline page toasts (orders) | Instant |
| Payment success/fail | Rich keyframes (`sv-success-*`, `sv-fail-*`) — appropriate for checkout climax |
| Accounting alerts | Static banners |

**Recommendation:** Unify admin toasts: enter `opacity + translateY(8px)`, exit faster; keep payment celebration localized to payment pages only.

---

## 19. Icons

- Accounting chevrons: **rotate** on expand (good pattern).
- Refresh / download / copy: usually static.
- `admin-nav-spin` / tick-pop keyframes exist for niche admin feedback.

**Recommendation:** Rotate chevrons everywhere expandable; spin only while refresh in-flight; no decorative icon loops on idle UI.

---

## 20. Proposed motion tokens

Align CSS and Framer on **one** scale (inspect-based; close to existing 150–180–240ms habits):

| Token | Duration | Use |
|-------|----------|-----|
| `motion-instant` | **90ms** | Press feedback, tab indicator |
| `motion-fast` | **140ms** | Hover color, chevron, toast exit |
| `motion-normal` | **180ms** | Default interactive (matches today’s CSS base) |
| `motion-moderate` | **220ms** | Drawer/modal panel |
| `motion-slow` | **280ms** | Rare storefront hero only |

**Easing**
- UI default: `cubic-bezier(0.22, 1, 0.36, 1)` (already in Tailwind fade-up / pageTransition)
- Drawer: keep `[0.32, 0.72, 0, 1]` or unify to same ease-out for calmer admin
- **No bounce / spring** in admin; storefront may keep soft ease only

**Implementation vehicle:** CSS variables in `globals.css` + update `lib/motion.ts` to the same numbers (seconds).

---

## 21. Transform guidelines (proposed)

| Surface | Motion |
|---------|--------|
| Button press | `scale(0.98)` ≤90ms; none if reduced-motion |
| Modal | opacity + `scale(0.98→1)`; backdrop opacity |
| Dropdown | opacity + `translateY(4px)` |
| Toast | opacity + `translateY(8px)` |
| Page | **none globally** |
| Sidebar mobile | `translateX` (existing) |
| Expandable | chevron `rotate(180deg)` |

Prefer **transform + opacity**. Accordion height may use layout when necessary.

---

## 22. Reduced-motion strategy

**Already present**
- Global CSS `@media (prefers-reduced-motion: reduce)` zeros animation/transition durations.
- `MotionConfig reducedMotion="user"` on storefront `Layout`.
- Framer `useReducedMotion` on drawers / PageTransition / shop drawer.
- Payment chime gated on reduced-motion.

**Gaps for implementation phase**
- Ensure new shared Modal/Toast respect the CSS media query (and Framer if used).
- Admin shell is outside storefront `MotionConfig` — rely on CSS reduce + any Framer hooks if added.
- Do not reintroduce payment shake/confetti without reduce guards (already largely covered by CSS hammer).

---

## 23. Performance risks

| Risk | Notes |
|------|-------|
| `transition-all` | Prefer property lists |
| Animating `height`/`top`/`left` | Accounting accordions if over-animated |
| Large Framer trees on tables | Avoid |
| `backdrop-filter` on modals | OK sparingly; costly on low-end |
| Marquee / Ken Burns / confetti | Storefront-only; already reduced by media query |
| Will-change abuse | Use sparingly on drawers only |

Low-end mobile: keep admin motion ≤220ms and property-limited.

---

## 24. Admin recommendations

- Calm, **utility-first**: hover color, press scale, chevron, modal/drawer/toast only.
- No page transitions.
- No card hover lifts on static finance widgets.
- Consolidate confirm modal + toast motion first (highest inconsistency vs drawers).

---

## 25. Storefront recommendations

- May keep slightly richer **product/home** reveals already in CSS.
- Keep cart drawer on `SlideDrawer`.
- Leave `ENABLE_PAGE_TRANSITIONS = false`.
- Payment success/fail motion stays **checkout-local**, not admin-wide language.

Both surfaces should share **tokens + easing**, even if density differs.

---

## 26. Exact files/components recommended for modification (implementation phase)

**Do modify (high leverage)**
- `frontend/app/globals.css` — CSS variables, active press, toast/modal utilities, token comments
- `frontend/lib/motion.ts` — align durations/easings
- `frontend/components/ui/SlideDrawer.tsx` — consume tokens
- `frontend/components/admin/AdminConfirmModal.tsx` — entrance/exit
- `frontend/components/admin/AdminToast.tsx` — entrance/exit
- `frontend/components/admin/AdminShell.tsx` — backdrop fade
- `frontend/components/admin/accounting/AdminAccountingNav.tsx` — optional expand polish (chevron already OK)
- Optional new: `components/ui/Button.tsx`, `components/ui/AdminModal.tsx` if consolidating

**Tailwind:** optionally map theme `transitionDuration` to tokens in `tailwind.config.ts`

---

## 27. Files/components that should NOT be modified (for motion phase)

- Backend, Prisma, APIs, checkout/payment verify, Razorpay, COD, accounting journals, GST, EWB, challan, quotation services
- Route destinations / middleware / auth cookies
- Delhivery / shipping booking logic
- Business form submit handlers (presentation wrappers only)
- Do not wholesale restyle every admin page file if shared primitives can absorb motion

Avoid editing large one-off pages (`orders/[id]/page.tsx`, `complaints/page.tsx`) except to **consume** shared toast/modal once available.

---

## 28. Dependency recommendation

**Do not add** a new animation library.

**Keep** `framer-motion` for drawers (already paid dependency cost).

**Prefer** CSS variables + Tailwind for buttons, tabs, toasts, modals where possible — lighter for admin density.

---

## 29. Implementation sequence (proposed Phase 2+)

1. **Tokens** in CSS + `lib/motion.ts` (single source of truth)  
2. **Reduced-motion** regression check  
3. **AdminConfirmModal** + **AdminToast** motion  
4. **AdminShell** backdrop  
5. **Base button `:active` scale** via CSS  
6. Align `SlideDrawer` to tokens  
7. Optional shared `Button` / migrate high-traffic CTAs  
8. Soften admin dashboard Framer entrance  
9. Storefront pass: only inconsistencies vs tokens (no new page transitions)  
10. QA on mobile + `prefers-reduced-motion`

---

## 30. Risk assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Accidental re-enable of page transitions | High | Keep flag false; document |
| Touching business logic while restyling buttons | Medium | CSS-first; no handler edits |
| Over-animating accounting tables | Medium | Explicit “no row motion” rule |
| Framer + CSS double-motion | Low | Tokens shared; one owner per surface |
| Layout shift from skeletons | Low | Prefer pulse placeholders sized correctly |

---

## Section checklist (requested map)

| # | Topic | Finding |
|---|--------|---------|
| 1 | Architecture | Hybrid CSS-first + Framer drawers |
| 2 | Libraries | framer-motion only |
| 3 | Shared primitives | Thin `ui/`; admin primitives hand-rolled |
| 4 | Inconsistencies | Timing, modal vs drawer, toast abrupt |
| 5 | Buttons | Base 180ms; no press scale; no shared Button |
| 6 | Navigation | Color hover; instant utility nav |
| 7 | Sidebar | Mobile slide; nested chevron only |
| 8 | Pages | Transitions disabled — keep off |
| 9 | Modals | Abrupt confirms; drawers good |
| 10 | Drawers | Shared SlideDrawer — reuse |
| 11 | Dropdowns | Mostly abrupt / native |
| 12 | Accordions | Chevron yes; height often instant |
| 13 | Tabs | Instant content — keep |
| 14 | Tables | Hover only — keep |
| 15 | Forms | Strong focus ring; quiet errors |
| 16 | Loading | spin/pulse/text mix |
| 17 | Notifications | Abrupt toasts; rich payment only |
| 18 | Icons | Good chevron pattern to standardize |
| 19 | Tokens | Propose 90/140/180/220/280ms |
| 20 | Reduced motion | Strong CSS + Framer partial |
| 21 | Performance | Watch `transition-all`, height, blur |
| 22–23 | Admin / storefront | Same tokens; different density |
| 24–25 | Touch / don’t touch | Shared chrome first; no commerce/accounting logic |
| 26 | Dependencies | No new lib |
| 27 | Sequence | Tokens → modal/toast → shell → CSS press |
| 28 | Risk | Manageable if CSS-first |

---

## Final verdict

Sarveda can adopt **one calm motion language** without new dependencies by **tokenizing** what already exists and upgrading a few shared surfaces (modal, toast, shell, base button CSS). Global page transitions remain **not recommended**. Reduced-motion support is **already strong at CSS level** and should be preserved as a hard requirement for any implementation.

**READY FOR MOTION IMPLEMENTATION?** **YES**

---

SARVEDA GLOBAL MOTION SYSTEM AUDIT COMPLETE — READY FOR REVIEW
