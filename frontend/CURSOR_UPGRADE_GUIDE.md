# Sarveda — Cursor Upgrade Guide
## Violet Lotus × Midnight Blend Theme

> **Strategy:** Paste one phase at a time into Cursor Chat (`Cmd+L`).  
> Wait for each phase to complete before starting the next.  
> Use `@codebase` so Cursor reads your full project automatically.

---

## Before you start — drop these files in

1. Copy `design-tokens.ts` → `frontend/lib/design-tokens.ts`
2. Open your project in Cursor
3. Follow the phases in order — **do not skip phases**

---

## PHASE 1 — Fonts & Global Tokens
*Paste this into Cursor Chat as-is*

```
@codebase

I want to upgrade the visual theme of this Next.js frontend. Do NOT change any routes, API calls, business logic, data fetching, or component interfaces. Only change visual styling.

STEP 1 — Update the font imports in app/layout.tsx:
- Remove Inter and Playfair Display
- Add these two fonts from next/font/google:
  1. Cormorant_Garamond: weights 300, 400, 600 — normal and italic styles — CSS variable "--font-cormorant"
  2. Nunito: weights 300, 400, 500, 600, 700 — CSS variable "--font-nunito"
- Apply both variables to the <html> element className
- Set body className to use --font-nunito as the base font
- Set viewport themeColor to "#22134A"

STEP 2 — Replace tailwind.config.ts brand colors with this palette:
{
  "violet-deep":  "#22134A",
  "violet":       "#5B3E9B",
  "violet-mid":   "#7B5EC0",
  "violet-light": "#EDE8FB",
  "violet-pale":  "#F7F4FF",
  "lavender":     "#C4B0E8",
  "lavender-mid": "#9B82CC",
  "ink":          "#1A0F35",
  "mid":          "#5A4880",
  "muted":        "#9888B8",
  "gold":         "#C8A460",
  "sage":         "#5A8C6B",
  "sage-light":   "#E5F0EA",
  "coral":        "#C45A4A",
  "coral-light":  "#FCF0EE",
  "green":        "#2E7D52",
  "green-light":  "#E5F5ED",
  "ivory":        "#FDFCFF",
  "bg":           "#F7F4FF"
}
Keep all existing Tailwind plugins and content paths unchanged.
Add fontFamily: { serif: ["var(--font-cormorant)", "serif"], sans: ["var(--font-nunito)", "sans-serif"] }

STEP 3 — Replace globals.css with:
- Page background: #F7F4FF
- Body text color: #1A0F35
- Font: var(--font-nunito)
- Keep all existing @tailwind directives
- Add these CSS custom properties to :root:
  --font-price: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  --brand-gold: #C8A460;
  --brand-violet: #5B3E9B;
  --brand-violet-deep: #22134A;
  --brand-lavender: #C4B0E8;
- Add Google Fonts import for Space Grotesk (weights 400, 500, 600) at the top of globals.css
- Add scrollbar styling: 5px width, #F7F4FF track, #C4B0E8 thumb, #7B5EC0 on hover
- Add utility class .price-text { font-family: var(--font-price); font-weight: 500; font-variant-numeric: tabular-nums; }
- Add utility class .display-text { font-family: var(--font-cormorant); }
- Keep all existing animation keyframes and utility classes, just update the color values
```

---

## PHASE 2 — Header Component
*Paste this into Cursor Chat after Phase 1 is complete*

```
@codebase

Update ONLY the SiteHeader component (components/layout/SiteHeader.tsx).
Do NOT change any logic, auth checks, navigation links, or cart integration.
Only change the visual styling.

Header design requirements:
- Background: rgba(26,8,64,0.92) with backdrop-filter: blur(24px)
- Border bottom: 2px solid rgba(91,62,155,0.45)
- Box shadow: 0 8px 32px rgba(10,4,30,0.55), 0 1px 0 rgba(196,176,232,0.08)
- Position: sticky top-0 z-50
- Logo: font-family Cormorant Garamond, italic, color #C4B0E8, with a small subtitle "YOGA · AYURVEDA · SOUND" in 10px tracking-widest below on desktop
- Nav links: color rgba(196,176,232,0.7) default, #C4B0E8 on hover, active link gets color #C4B0E8 + 2px solid #5B3E9B bottom border
- Nav link font: 13px, font-weight 400, letter-spacing 0.04em

For the 3 action buttons (Search, Cart, Account), replace any emoji or text with clean inline SVG icons using these exact paths:

Search icon SVG:
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
  <circle cx="11" cy="11" r="7"/>
  <line x1="16.5" y1="16.5" x2="22" y2="22"/>
</svg>

Cart/Bag icon SVG:
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
  <line x1="3" y1="6" x2="21" y2="6"/>
  <path d="M16 10a4 4 0 0 1-8 0"/>
</svg>

User/Account icon SVG:
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
  <circle cx="12" cy="7" r="4"/>
</svg>

Button container: 40x40px, border-radius 8px, color #9B82CC default, #C4B0E8 on hover, background rgba(196,176,232,0.08) on hover, active scale(0.92)
Cart badge: 16px circle, background #5B3E9B, white text, 9px bold font

Announcement bar (above header):
- Background: #0F0620
- Border bottom: 1px solid rgba(91,62,155,0.3)
- Text color: #C8A460
- Font size: 11px, letter-spacing: 0.6px, font-weight 500
- Any promo code in the text should be color #E8C870 and font-weight 700
- Keep existing marquee/scroll animation

Mobile menu overlay:
- Background: rgba(22,8,58,0.97) with backdrop-filter: blur(20px)
- Nav links: 18px Cormorant Garamond, color #C4B0E8
- Close button: color #9B82CC
- Hamburger menu icon (replace any emoji/text):
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
  <line x1="4" y1="6" x2="20" y2="6"/>
  <line x1="4" y1="12" x2="20" y2="12"/>
  <line x1="4" y1="18" x2="20" y2="18"/>
</svg>
```

---

## PHASE 3 — Bottom Navigation
*Paste this into Cursor Chat after Phase 2 is complete*

```
@codebase

Update ONLY the BottomNav component (components/layout/BottomNav.tsx).
Do NOT change routing, active state logic, or cart count integration.

IMPORTANT CHANGE: Replace whatever the current 5th tab is with a "Courses" tab:
- Tab 1: Home → href="/"
- Tab 2: Store → href="/shop"
- Tab 3: Courses → href="/courses"  ← ADD THIS (was possibly Chat or something else)
- Tab 4: Events → href="/events"
- Tab 5: Cart → href="/cart" (with item count badge)

Visual styling:
- Background: rgba(22,8,58,0.96) with backdrop-filter: blur(24px)
- Border top: 2px solid rgba(91,62,155,0.4)
- Box shadow: 0 -4px 24px rgba(10,4,30,0.4)
- Active indicator: 2px wide, 24px long bar at TOP of tab, color #5B3E9B
- Active icon + label color: #C4B0E8
- Inactive icon + label color: rgba(123,94,192,0.5)

Replace ALL emoji icons with these inline SVGs (stroke style, currentColor):

Home:
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z"/>
  <polyline points="9 22 9 12 15 12 15 22"/>
</svg>

Store (shopping bag):
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
  <line x1="3" y1="6" x2="21" y2="6"/>
  <path d="M16 10a4 4 0 0 1-8 0"/>
</svg>

Courses (open book):
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
</svg>

Events (calendar):
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
  <line x1="16" y1="2" x2="16" y2="6"/>
  <line x1="8" y1="2" x2="8" y2="6"/>
  <line x1="3" y1="10" x2="21" y2="10"/>
</svg>

Cart (with badge):
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
  <line x1="3" y1="6" x2="21" y2="6"/>
  <path d="M16 10a4 4 0 0 1-8 0"/>
</svg>
Cart badge: position absolute top-1 right-1, 15px circle, #5B3E9B bg, white 9px bold text

Label: 10px, font-weight 500, letter-spacing 0.04em
```

---

## PHASE 4 — Footer
*Paste this into Cursor Chat after Phase 3 is complete*

```
@codebase

Update ONLY the SiteFooter component (components/layout/SiteFooter.tsx).
Do NOT change any links, routes, or text content.

Visual styling:
- Background: linear-gradient(180deg, #22134A 0%, #1A0F35 100%)
- Border top: 1px solid rgba(196,176,232,0.12)
- Brand logo: Cormorant Garamond italic, 28px, color #C4B0E8
- Tagline below logo: 10px, letter-spacing 0.2em, uppercase, color rgba(196,176,232,0.45)
- Brand description: 13px, color rgba(196,176,232,0.45), line-height 1.75, font-weight 300
- Column headings: 10px, uppercase, letter-spacing 0.2em, color #C4B0E8, font-weight 400
- Footer links: 13px, color rgba(196,176,232,0.45), font-weight 300, hover color #C4B0E8
- Social icon buttons: 36x36px, background rgba(196,176,232,0.1), color rgba(196,176,232,0.5), border-radius 8px, hover background rgba(196,176,232,0.18)
- Trust badges bar (if present): background #1A1208, border top and bottom 1px solid rgba(196,176,232,0.12), text color rgba(196,176,232,0.6)
- Bottom bar: border-top 1px solid rgba(196,176,232,0.12), copyright text 11px rgba(196,176,232,0.35)
```

---

## PHASE 5 — Product Cards
*Paste this into Cursor Chat after Phase 4 is complete*

```
@codebase

Update ONLY the ProductCard component (components/shop/ProductCard.tsx) and any ProductCardAddButton.
Do NOT change props interface, pricing logic, wishlist logic, or add-to-cart functionality.

Visual styling:
- Card background: #FDFCFF
- Card border: 1px solid rgba(196,176,232,0.25), border-radius 16px on md+ screens, 0 on mobile (border-bottom only)
- Card hover: transform translateY(-4px), box-shadow 0 12px 36px rgba(91,62,155,0.16)
- Image area background (when no image): #EDE8FB
- Image hover: scale(1.06) transition

Category label: 10px, color #5A8C6B (sage), uppercase, letter-spacing 0.16em, font-weight 700
Product name: Cormorant Garamond, 17px, color #1A0F35, font-weight 400, line-height 1.25
Price: font-family var(--font-price) (Space Grotesk), 15px, font-weight 500, color #1A0F35, letter-spacing 0.01em
Strike-through MRP: 11px, same font, color #9888B8, text-decoration line-through
Discount badge: background #C45A4A, white text, 9px bold, border-radius 6px, letter-spacing 0.08em

Add to cart button: 28x28px, background #5B3E9B, border-radius 8px, white "+" icon, hover background #7B5EC0

Sale/New/Featured badges: background rgba(91,62,155,0.10), color #3A2070, border 1px solid rgba(91,62,155,0.22), border-radius 6px, 9px font

Quick view overlay on hover (desktop): background rgba(34,19,74,0.82), text color #C4B0E8, 12px uppercase tracking-wide

Wishlist button: white circle 28px, border 0.5px solid #EAE4F5, opacity 0 default, opacity 1 on card hover
```

---

## PHASE 6 — Home Page Hero & Sections
*Paste this into Cursor Chat after Phase 5 is complete*

```
@codebase

Update the Home page (app/page.tsx) and any Hero component. Do NOT change data fetching, API calls, or content.

Hero section:
- Background: linear-gradient(160deg, #22134A 0%, #3A2070 60%, #5B3E9B 100%)
- Subtle radial glow circles: before/after pseudo-elements with rgba(196,176,232,0.08) radial gradient
- Eyebrow tag: border 1px solid rgba(196,176,232,0.22), border-radius 3px, padding 5px 16px, font-size 10px, color #C4B0E8, letter-spacing 0.2em, uppercase
- H1: Cormorant Garamond, 56-68px (responsive), font-weight 300, color #F7F4FF, line-height 1.08
- Italic/accent word in H1: color #C4B0E8
- Sub text: 15-16px, color rgba(196,176,232,0.75), line-height 1.75, font-weight 300
- Primary button: background #5B3E9B, color white, border-radius 3px (sharp), padding 14px 28px, font-size 12px, uppercase, letter-spacing 0.12em, font-weight 500, hover background #7B5EC0 with translateY(-1px) and box-shadow
- Secondary button: transparent background, color #C4B0E8, border 1px solid rgba(196,176,232,0.35), border-radius 3px, same padding
- Stats bar: border-top 1px solid rgba(196,176,232,0.12), stat number Cormorant Garamond 36-40px color #C4B0E8, stat label 11px uppercase letter-spacing 0.12em color rgba(196,176,232,0.45)

Section headings throughout home page:
- Font: Cormorant Garamond, 36-40px, font-weight 300, color #1A0F35
- Italic accent: color #5B3E9B
- Section eyebrow (small label above heading): 10px, color #5B3E9B, uppercase, letter-spacing 0.16em

Category filter pills:
- Default: transparent background, border 1px solid rgba(196,176,232,0.22), border-radius 20px, color rgba(90,72,128,0.7), font-size 12px
- Active/hover: background rgba(91,62,155,0.08), border-color rgba(196,176,232,0.4), color #5B3E9B

Dosha quiz banner:
- Background: #5B3E9B (solid violet)
- Before/after decorative circles: rgba(255,255,255,0.06) radial gradients
- Title: Cormorant Garamond 44-52px, italic accent color #C4B0E8
- Description: 15px, rgba(255,255,255,0.7), font-weight 300
- Primary CTA: white background, #22134A text, border-radius 3px, uppercase
- Secondary CTA: transparent, white text, border rgba(255,255,255,0.3)
- Dosha type cards (Vata/Pitta/Kapha): border 1px solid rgba(255,255,255,0.15), color white, name in Cormorant Garamond 22px gold (#C4B0E8)
```

---

## PHASE 7 — Shop, Courses, Events Pages
*Paste this into Cursor Chat after Phase 6 is complete*

```
@codebase

Update the page headers for shop (app/shop/page.tsx), courses (app/courses/page.tsx), and events (app/events/page.tsx).
Do NOT change any data fetching, filtering, pagination, or component logic.

All three pages share the same page hero header style:
- Background: linear-gradient(160deg, #22134A 0%, #3A2070 60%, #5B3E9B 100%)
- Border bottom: 1px solid rgba(196,176,232,0.15)
- Subtle radial glow: position absolute, right -80px top -80px, 400px circle, rgba(196,176,232,0.06)
- Eyebrow text: 10px, #C4B0E8, uppercase, letter-spacing 0.18em, font-weight 400
- Page title h1: Cormorant Garamond, 48-56px, color #F7F4FF, font-weight 300, italic accent word color #C4B0E8
- Subtitle: 15px, rgba(196,176,232,0.55), font-weight 300, letter-spacing 0.02em

Events page hero is an exception — use sage green:
- Background: linear-gradient(160deg, #3D5C3D 0%, #5A8C6B 100%)
- Eyebrow color: rgba(255,255,255,0.7)
- Title color: white, italic accent rgba(255,255,255,0.85)
- Subtitle: rgba(255,255,255,0.55)

Shop page sidebar (desktop):
- Background: #FDFCFF, border 1px solid rgba(196,176,232,0.25), border-radius 16px
- Category heading: 10px, uppercase, letter-spacing 0.18em, color #5B3E9B, font-weight 400
- Category items: 13px, color #5A4880, font-weight 300, hover: color #5B3E9B, background rgba(91,62,155,0.06), padding-left increase to 20px
- Active category: color #5B3E9B, font-weight 600

Filter chips (shop):
- Default: border 1px solid rgba(196,176,232,0.22), background transparent, color rgba(90,72,128,0.7), border-radius 20px, font-size 11px, uppercase letter-spacing 0.08em
- Active/hover: background rgba(91,62,155,0.08), border-color #9B82CC, color #5B3E9B

Courses grid cards:
- Background: #FDFCFF, border 1px solid rgba(196,176,232,0.25), border-radius 18px
- Image area: gradient backgrounds (dark violet/sage/gold variants per course type)
- Live badge: background #2E7D52, white text, border-radius 6px, "●" dot prefix
- Course type label: 10px, color #5B3E9B, uppercase, letter-spacing 0.14em
- Course title: Cormorant Garamond 20px, color #1A0F35, font-weight 400
- Meta (duration, mode): 11px, color #9888B8, font-weight 300
- Price: Space Grotesk font, 15px, font-weight 500
- Enroll button: background #5B3E9B, white text, border-radius 8px, font-size 11px uppercase
- Explore button: background #EDE8FB, color #22134A, border-radius 8px

Event cards:
- Background #FDFCFF, border 1px solid rgba(196,176,232,0.25), border-radius 18px
- Date block: background #EDE8FB, border-radius 12px, day number Cormorant Garamond 26px color #22134A, month 9px color #5B3E9B
- Event type: 10px color #5A8C6B, uppercase letter-spacing
- Event title: Cormorant Garamond 20px, color #1A0F35
- Price tag: background #EDE8FB, color #22134A, border-radius 8px, font Space Grotesk
- Free tag: background #E5F0EA, color #2E7D52
- Register button: background #5B3E9B, white, border-radius 8px
```

---

## PHASE 8 — Cart, Checkout & Order Confirmation
*Paste this into Cursor Chat after Phase 7 is complete*

```
@codebase

Update the Cart (app/cart/page.tsx), Checkout (app/checkout/page.tsx), and Order Confirmation pages.
Do NOT change any cart state, payment logic, form validation, or API calls.

Cart page:
- Page background: #F7F4FF
- Cart item row: padding 20px 0, border-bottom 1px solid rgba(196,176,232,0.22)
- Item image thumbnail: 72x72px, border-radius 12px, border 1px solid rgba(196,176,232,0.2)
- Item category: 10px, color #5B3E9B, uppercase letter-spacing
- Item name: Cormorant Garamond 18px, color #1A0F35
- Quantity control: border 1px solid rgba(196,176,232,0.3), border-radius 10px, button color #5B3E9B
- Item price: Space Grotesk font, 16px, font-weight 500

Order summary box:
- Background: #FDFCFF, border 1px solid rgba(196,176,232,0.25), border-radius 18px, padding 24px
- Title: Cormorant Garamond 22px, font-weight 400
- Row labels: 13px, color #5A4880, font-weight 300
- Row values: Space Grotesk font, 13px, font-weight 500, color #1A0F35
- Discount value: color #2E7D52
- Total row: Space Grotesk 15px, font-weight 600, color #1A0F35
- Promo input: background #F7F4FF, border 1px solid rgba(196,176,232,0.3), border-radius 10px
- Checkout CTA button: full width, background #5B3E9B, white, border-radius 12px, 15px, font-weight 700, uppercase letter-spacing

Checkout page:
- Progress steps: done=green(#2E7D52), active=violet(#5B3E9B), todo=light (#EDE8FB)
- Form blocks: background #FDFCFF, border 1px solid rgba(196,176,232,0.25), border-radius 18px
- Form labels: 10px, uppercase, letter-spacing 0.12em, color #5A4880, font-weight 300
- Form inputs: background #F7F4FF, border 1px solid rgba(196,176,232,0.3), border-radius 10px, focus border #9B82CC
- Payment options: border 1px solid rgba(196,176,232,0.3), selected border #5B3E9B + background #F7F4FF
- Place order button: background #22134A, white, border-radius 12px, Space Grotesk font for the price

Order confirmation:
- Hero: linear-gradient(160deg, #22134A, #3A2070), centered text
- Success icon: 72px circle, background #2E7D52, white checkmark
- Title: Cormorant Garamond 48px, italic accent in #C4B0E8
- Order ID tag: border 1px solid rgba(196,176,232,0.2), color #C4B0E8
- Tracking steps: done=green, active=violet, todo=light with connecting line
- Items card: background #FDFCFF, border 1px solid rgba(196,176,232,0.25), border-radius 18px
- Item price: Space Grotesk font, color #5B3E9B
- Total paid: Space Grotesk 26px, color #1A0F35
- Continue shopping button: background #5B3E9B, white, border-radius 12px
- Track order button: background #EDE8FB, color #22134A
```

---

## PHASE 9 — Corporate Wellness & Insights Pages
*Paste this into Cursor Chat after Phase 8 is complete*

```
@codebase

Update the Corporate Wellness and Insights pages with the theme.
Do NOT change content, data, or any component logic.

Corporate Wellness page hero:
- Background: linear-gradient(160deg, #22134A 0%, #3A2070 50%, #1E3A2F 100%)  ← violet fading to sage
- Page title and styling: same as standard page hero
- Partner logos strip: background #EDE8FB, border top/bottom 1px solid rgba(196,176,232,0.2)
- Partner logo chips: background white, border 1px solid rgba(196,176,232,0.25), border-radius 10px, text color #5A4880, font-weight 600

Programme cards (SAHYOG/SARGAM/SAMATVA/SAMSARA):
- Background: white, border 1px solid rgba(196,176,232,0.25), border-radius 20px, hover shadow
- Image area: distinct gradient per programme (violet/gold/sage/coral)
- Programme number: 10px, color #5B3E9B, uppercase letter-spacing
- Programme name (Sanskrit): Cormorant Garamond 24px, color #5B3E9B, font-weight 600
- Programme subtitle: 12px, color #7B5EC0, font-weight 400
- Description: 13px, color #5A4880, line-height 1.65, font-weight 300

Three pillars section: background #22134A (dark violet), pillar cards background rgba(196,176,232,0.08)

Testimonial (Vaishali from Publicis):
- Dark section, italic Cormorant Garamond quote, #C4B0E8 author name

Insights page:
- Category filter pills: same style as shop filters
- Featured article: side-by-side layout, image left, content right
  - Category: 10px, #5B3E9B, uppercase
  - Title: Cormorant Garamond 34px, font-weight 400, color #1A0F35
  - Description: 14px, color #5A4880, line-height 1.75
  - Read time: 12px, color #9888B8
  - Read link: 12px, color #5B3E9B, uppercase letter-spacing
- Article grid cards: same insight card style as home page
```

---

## PHASE 10 — Final Polish & QA Prompt
*Run this last to catch anything missed*

```
@codebase

Do a final pass to ensure consistency across the entire frontend. Fix any remaining issues:

1. Any component still using the OLD color values below — replace them:
   - bg-green-* → bg-brand-sage or bg-brand-green
   - bg-amber-* / text-amber-* → bg-brand-violet or text-brand-gold
   - text-gray-* → text-brand-muted or text-brand-mid  
   - border-gray-* → border-brand-violet-light
   - Any hardcoded hex that isn't in the design token list

2. Ensure ALL price displays across every page use:
   font-family: var(--font-price)  (Space Grotesk)
   font-weight: 500
   font-variant-numeric: tabular-nums
   This includes: product prices, MRP strikethrough, course prices, event prices, cart totals, order totals, checkout totals

3. Ensure ALL headings (h1, h2, h3) use:
   font-family: var(--font-cormorant)  (Cormorant Garamond)

4. Ensure body/paragraph text uses:
   font-family: var(--font-nunito)  (Nunito)

5. Check these specific interactive states work:
   - All primary buttons: hover should be bg-brand-violet-mid with translateY(-1px) and violet box-shadow
   - All card hover states: translateY(-4px) with card-hover shadow
   - All form inputs focus: border-color #9B82CC

6. Remove any leftover CSS that references:
   - Forest green, #1e3a2f as a primary color
   - Amber/gold as a primary UI color (gold is only for announcement bar and promo highlights)
   - Inter font (replaced by Nunito)
   - Playfair Display (replaced by Cormorant Garamond)

7. Run a build to check for TypeScript errors and fix any that your changes introduced.
```

---

## Tips for using these prompts in Cursor

**Before each phase:**
- Press `Cmd+L` to open Cursor Chat
- Make sure `@codebase` is included — this gives Cursor full project context
- Use **Composer mode** (not chat) for phases 2–9 so Cursor edits files directly

**If Cursor misses something:**
> "You missed the [component name]. Apply the same violet theme changes to it using the same colour tokens."

**If something breaks:**
> "Revert [filename] to before this conversation and try again, being more careful not to change the component's props or logic."

**After all phases — final check:**
> "@codebase Run `npm run build` and fix any TypeScript or module errors introduced by the theme changes."

**Quick reference — always available to paste:**
> "The primary violet is #5B3E9B. The deep violet (headers/footers) is #22134A. Lavender text on dark is #C4B0E8. Page background is #F7F4FF. Price font is Space Grotesk (var(--font-price)). Display font is Cormorant Garamond (var(--font-cormorant)). Body font is Nunito (var(--font-nunito))."
