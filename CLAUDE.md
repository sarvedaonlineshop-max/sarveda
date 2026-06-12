# SARVEDA — Cursor Project Memory File
# Read this FULLY before every single response.
# This is the complete source of truth for the entire project.
# Last updated: May 19, 2026 (migration sprint + PDP fine-tune)

---

## 0. CURRENT FOCUS & NEW MACHINE HANDOFF

**Read this section first on every new machine or new Cursor chat.**

### Active work (May 19, 2026)
- **Product PDP fine-tune** — match live sarveda.com / Amazon-style layout:
  - Left: sticky gallery + thumbnails + S3 audio (`ProductGallery`, `ProductAudio`)
  - Center: title, variants, pair-with, **About + accordion inside same column** (page scroll)
  - Right: sticky **buy box** (`ProductBuyBox`) — price, delivery timeline, qty, Add to cart
  - **Removed:** pincode serviceability on PDP
  - Key files: `frontend/components/product/ProductDetailExperience.tsx`, `ProductBuyBox.tsx`, `frontend/app/product/[slug]/page.tsx`
- **Awaiting user feedback** on PDP after deploy to `https://sarveda-demo.xyz`
- **Next after PDP:** run `npm run import:variations` on EC2/RDS (uses `data/variations.xml`), reviews UI, per-variant images if needed

### Demo migration status (mostly done; final migration ops pending)
- ✅ S3 media migration (`sarveda-media` bucket **us-east-1** — set `AWS_S3_REGION=us-east-1` on EC2; EC2 stays `ap-south-1`)
- ✅ ~1,170 files uploaded; map at `data/media-migration-map.json`
- ✅ Corporate wellness, vaidya/mentor/retreat/offers pages, testimonials API, coupons import
- ✅ Category page 500 fix (no `force-dynamic` + `generateStaticParams` conflict on Vercel)
- ⬜ Email/WhatsApp on all order events, Shiprocket E2E, GST invoice E2E, full SEO parity (22 sitemaps) — deferred
- Details: `data/MIGRATION_STATUS.md`

### Migration Readiness
- SEO: ✅ Complete
- Search Console data: ⬜ Pending (need from Arjun)
- 301 redirect map: ⬜ Pending
- Cloudflare setup: ⬜ Pending

**Next step:** Get Google Search Console access from Arjun to finalise 301 redirect map before migration.

### New machine setup (clone — do NOT copy whole folder as primary sync)
1. `git clone https://github.com/sarvedaonlineshop-max/sarveda.git && cd sarveda && git pull`
2. Copy **securely** from old machine (not in git): `/.env`, `/frontend/.env.local`, `~/.ssh/sarveda-key.pem` if deploying
3. `docker compose up -d` (local Postgres + Redis)
4. `cd backend && npm install && npx prisma migrate deploy && npm run dev`
5. `cd frontend && npm install && npm run dev` → http://localhost:3000
6. Open repo in Cursor (same account optional for settings). **Start chat with the handoff prompt below.**

### Environment variables (dev machine)
- **Backend `/.env` is already configured** on Shivakumar's machine (DB, Redis, JWT, Razorpay/Stripe/PayPal, AWS S3, SendGrid, Shiprocket, Delhivery, Zoho, MSG91, etc.). **Do not re-prompt to fill keys** unless a specific feature fails or `validateEnv` reports a missing required var at startup.
- **`frontend/.env.local`** is separate (copy from machine; `JWT_SECRET` must match backend for admin auth).
- Only flag gaps when code adds a **new** required env var or a runtime error points to a missing key.

### Cursor AI does not remember other machines
- Chats are not the source of truth. Use **git + this file + commits**.
- Always say: *"Read CLAUDE.md fully, especially section 0."*

### Handoff prompt (paste on new machine)
```
You are working on the Sarveda eCommerce migration (WordPress → Next.js + Express + Prisma).

1. Read CLAUDE.md FULLY before doing anything — especially section 0 (CURRENT FOCUS) and section 13 (build status).
2. Read data/MIGRATION_STATUS.md for migration checklist.
3. Stack is fixed: Next.js 14, Express+TS, PostgreSQL+Prisma, Redis, Razorpay — never suggest alternatives.
4. Staging: https://sarveda-demo.xyz (Vercel frontend, /api proxied to EC2 13.206.192.106:5000).
5. S3 bucket sarveda-media is us-east-1; EC2 uses AWS_S3_REGION=us-east-1 for uploads.
6. Continue from: product PDP fine-tune (Amazon 3-column sticky layout). I will give feedback after testing — wait for my PDP notes unless I ask you to implement something specific.
7. Do not commit unless I ask. Run commands yourself; do not give up on first error.
```

---

## 1. PROJECT OVERVIEW

**Client:** Sarveda (sarveda.com) — Arjun (Owner)
**Developer:** Shivakumar M
**Type:** Full custom eCommerce platform replacing WordPress/WooCommerce
**Business:** Yoga, Meditation, Sound Healing, Ayurveda products + courses
**Revenue:** ₹3,07,975 on record single day — serious production business
**International:** Sells to India, US, UK, and worldwide
**Timeline:** Phase 1 live June 15, 2026. Full launch July 20, 2026.
**10-Day Demo Target:** May 20, 2026 — staging URL with products + cart + Razorpay

---

## 2. TECH STACK — COMPLETELY FIXED

```
Frontend:   Next.js 14 (App Router) + Tailwind CSS → Vercel
Backend:    Node.js + Express + TypeScript → Railway (dev) → AWS EC2 Mumbai (prod)
Database:   PostgreSQL via Prisma ORM → Railway (dev) → AWS RDS Mumbai (prod)
Cache:      Redis → Railway (dev) → AWS ElastiCache Mumbai (prod)
Jobs:       BullMQ (Redis-backed)
Auth:       JWT (HTTP-only cookies) + Google OAuth + Phone OTP
Payments:   Razorpay (India) + Stripe (International) + PayPal Standard
Shipping:   Shiprocket API + Delhivery API + Bluedart API
Media:      AWS S3 + CloudFront CDN (from Day 1)
Email:      SendGrid
WhatsApp:   WATI API
```

**HARD RULES — NEVER SUGGEST ALTERNATIVES:**
- NO NestJS → Express + TypeScript only
- NO MongoDB → PostgreSQL + Prisma only
- NO GraphQL → REST API only
- NO Cloudinary → AWS S3 + CloudFront only

---

## 3. DEPLOYMENT — 3 STAGES

### Stage 1 — Local Development (Days 1–70)
```
Frontend:  http://localhost:3000  (Next.js dev server)
Backend:   http://localhost:5000  (Express + ts-node-dev)
Database:  localhost:5432         (Docker PostgreSQL)
Redis:     localhost:6379         (Docker Redis)
Media:     AWS S3 bucket: sarveda-dev
```

### Stage 2 — Railway Staging (Days 30–100)
```
Frontend:  Vercel preview URL (auto on git push)
Backend:   https://sarveda-api.up.railway.app
Database:  Railway PostgreSQL
Redis:     Railway Redis
Media:     Same AWS S3 (sarveda-dev)
```

### Stage 3 — AWS Production (Week 15, before launch)
```
Frontend:  https://sarveda.com (Vercel + custom domain)
Backend:   AWS EC2 t3.medium, Mumbai (ap-south-1)
Database:  AWS RDS PostgreSQL db.t3.medium, Mumbai, Multi-AZ
Redis:     AWS ElastiCache cache.t3.micro, Mumbai
CDN:       AWS CloudFront, global edge
DNS:       AWS Route 53
```

WHY: Mumbai = 20-30ms latency for Indian users vs 200ms+ from Railway US.
Indian customers on checkout feel instant vs sluggish. Direct conversion impact.

---

## 4. FOLDER STRUCTURE

```
sarveda/
├── CLAUDE.md                         ← THIS FILE
├── docker-compose.yml                ← Local PostgreSQL + Redis
├── .env.example
├── .gitignore
├── README.md
│
├── backend/
│   ├── src/
│   │   ├── app.ts                    ← Express app
│   │   ├── server.ts                 ← Entry point
│   │   ├── config/
│   │   │   ├── db.ts                 ← Prisma client
│   │   │   ├── redis.ts              ← Redis (ioredis)
│   │   │   ├── s3.ts                 ← AWS S3 client
│   │   │   ├── logger.ts             ← Winston
│   │   │   └── env.ts                ← Zod env validation
│   │   ├── middleware/
│   │   │   ├── auth.ts               ← JWT verify
│   │   │   ├── admin.ts              ← Role check
│   │   │   ├── rateLimiter.ts        ← Rate limits
│   │   │   ├── validate.ts           ← Zod middleware
│   │   │   ├── redirects.ts          ← 301 SEO redirects
│   │   │   └── errorHandler.ts       ← Global errors
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── products/
│   │   │   ├── categories/
│   │   │   ├── cart/
│   │   │   ├── checkout/
│   │   │   ├── orders/
│   │   │   ├── payments/
│   │   │   │   ├── razorpay.ts
│   │   │   │   ├── stripe.ts
│   │   │   │   ├── paypal.ts
│   │   │   │   ├── cod.ts
│   │   │   │   ├── razorpay.webhook.ts ← Idempotent webhook handler
│   │   │   │   └── reconciliation.ts ← Settlement dashboard
│   │   │   ├── shipping/
│   │   │   │   ├── shiprocket.ts
│   │   │   │   ├── delhivery.ts
│   │   │   │   ├── bluedart.ts
│   │   │   │   └── router.ts         ← Auto-courier selection
│   │   │   ├── coupons/
│   │   │   ├── courses/
│   │   │   ├── events/
│   │   │   ├── vaidyas/
│   │   │   ├── mentors/
│   │   │   ├── retreats/
│   │   │   ├── blog/
│   │   │   ├── reviews/
│   │   │   ├── wishlist/
│   │   │   ├── notifications/
│   │   │   │   ├── email.ts          ← SendGrid
│   │   │   │   └── whatsapp.ts       ← WATI
│   │   │   ├── admin/
│   │   │   └── seo/
│   │   │       ├── sitemap.ts
│   │   │       └── schema.ts         ← JSON-LD
│   │   ├── jobs/
│   │   │   ├── paymentTimeoutJob.ts  ← BullMQ 15 min unpaid cancel
│   │   │   ├── emailQueue.ts
│   │   │   ├── whatsappQueue.ts
│   │   │   ├── invoiceQueue.ts
│   │   │   └── reconciliationJob.ts
│   │   └── utils/
│   │       ├── jwt.ts                ← From ISKCON (95% reuse)
│   │       ├── hash.ts               ← From ISKCON (100% reuse)
│   │       ├── otp.ts                ← From ISKCON (70% reuse)
│   │       ├── money.ts              ← toPaise/toRupees/formatINR
│   │       ├── invoice.ts            ← GST PDF generation
│   │       ├── slugify.ts
│   │       └── orderNumber.ts        ← SRV-{YEAR}{MONTH}{SEQ}
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts                   ← Import from WooCommerce CSV
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx                  ← Homepage
    │   ├── shop/page.tsx             ← /shop (WC URL preserved)
    │   ├── product/[slug]/page.tsx   ← /product/[slug] (preserved)
    │   ├── product-category/[slug]/page.tsx
    │   ├── cart/page.tsx
    │   ├── checkout/page.tsx
    │   ├── my-account/page.tsx
    │   ├── course/[slug]/page.tsx
    │   ├── event/[slug]/page.tsx
    │   ├── vaidya/[slug]/page.tsx
    │   ├── mentor/[slug]/page.tsx
    │   ├── retreat/[slug]/page.tsx
    │   ├── [slug]/page.tsx           ← Blog posts
    │   ├── offers/[slug]/page.tsx
    │   ├── sitemap.xml/route.ts      ← Auto-generated
    │   ├── robots.txt/route.ts
    │   └── admin/                    ← Protected admin
    ├── components/
    │   ├── ui/
    │   ├── product/
    │   │   ├── ProductCard.tsx
    │   │   ├── ProductGallery.tsx
    │   │   ├── AudioPlayer.tsx       ← HTML5 audio (38 products)
    │   │   ├── VariantSelector.tsx
    │   │   ├── PriceDisplay.tsx      ← INR/USD/GBP by zone
    │   │   └── AccordionDescription.tsx ← All 169 products
    │   ├── cart/
    │   │   ├── CartDrawer.tsx        ← Slide-in, no page reload
    │   │   └── CartItem.tsx
    │   ├── checkout/
    │   │   ├── AddressForm.tsx
    │   │   ├── ShippingSelector.tsx
    │   │   ├── CouponInput.tsx
    │   │   └── PaymentSelector.tsx   ← Razorpay/Stripe/PayPal/COD
    │   ├── layout/
    │   │   ├── Header.tsx
    │   │   ├── Footer.tsx
    │   │   └── MobileNav.tsx
    │   └── seo/
    │       ├── JsonLD.tsx
    │       └── BreadcrumbSchema.tsx
    ├── lib/
    │   ├── api.ts
    │   ├── auth.ts
    │   ├── cart.ts                   ← Zustand store
    │   ├── currency.ts               ← Zone detection + pricing
    │   └── utils.ts
    ├── package.json
    └── next.config.js
```

---

## 5. COMPLETE PRISMA SCHEMA

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email        String   @unique
  phone        String?  @unique
  name         String?
  passwordHash String?
  googleId     String?  @unique
  role         Role     @default(CUSTOMER)
  isVerified   Boolean  @default(false)
  deletedAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  orders       Order[]
  cart         Cart?
  addresses    Address[]
  wishlist     Wishlist[]
  reviews      Review[]
  enrollments  Enrollment[]
  bookings     Booking[]
}

enum Role { CUSTOMER ADMIN SUPER_ADMIN }

model Address {
  id         String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String  @db.Uuid
  label      String?
  fullName   String
  phone      String
  line1      String
  line2      String?
  city       String
  state      String
  postalCode String
  country    String  @default("IN")
  isDefault  Boolean @default(false)
  user       User    @relation(fields: [userId], references: [id])
}

model Product {
  id               String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug             String         @unique
  name             String
  description      String?
  shortDescription String?
  productType      ProductType    @default(SIMPLE)
  status           ProductStatus  @default(DRAFT)
  taxClass         String?        @default("standard")
  hasAudio         Boolean        @default(false)
  audioUrl         String?
  seoTitle         String?
  seoDescription   String?
  seoKeyword       String?
  wooCommerceId    Int?           @unique
  deletedAt        DateTime?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  variants         ProductVariant[]
  images           ProductImage[]
  categories       ProductCategory[]
  accordionItems   AccordionItem[]
  reviews          Review[]
  wishlist         Wishlist[]
}

enum ProductType   { SIMPLE VARIABLE DIGITAL }
enum ProductStatus { DRAFT ACTIVE ARCHIVED }

model ProductVariant {
  id             String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  productId      String        @db.Uuid
  sku            String        @unique
  mrpInPaise     Int
  saleInPaise    Int
  mrpUsdCents    Int?
  saleUsdCents   Int?
  mrpGbpPence    Int?
  saleGbpPence   Int?
  weightGrams    Int?
  isDefault      Boolean       @default(false)
  status         VariantStatus @default(ACTIVE)
  product        ProductVariant[] @ignore
  productRel     Product       @relation(fields: [productId], references: [id])
  inventory      Inventory?
  attributeValues VariantAttributeValue[]
  shippingRates  VariantShippingRate[]
  cartItems      CartItem[]
  orderItems     OrderItem[]
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}

enum VariantStatus { ACTIVE INACTIVE }

model Inventory {
  id                String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  variantId         String         @unique @db.Uuid
  onHand            Int            @default(0)
  reserved          Int            @default(0)
  lowStockThreshold Int            @default(5)
  variant           ProductVariant @relation(fields: [variantId], references: [id])
}

model ProductImage {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  productId String  @db.Uuid
  url       String
  altText   String?
  position  Int     @default(0)
  isPrimary Boolean @default(false)
  product   Product @relation(fields: [productId], references: [id])
}

model AccordionItem {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  productId String  @db.Uuid
  title     String
  content   String
  position  Int     @default(0)
  product   Product @relation(fields: [productId], references: [id])
}

model Category {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug           String           @unique
  name           String
  description    String?
  imageUrl       String?
  parentId       String?          @db.Uuid
  position       Int              @default(0)
  seoTitle       String?
  seoDescription String?
  parent         Category?        @relation("CategoryTree", fields: [parentId], references: [id])
  children       Category[]       @relation("CategoryTree")
  products       ProductCategory[]
}

model ProductCategory {
  productId  String  @db.Uuid
  categoryId String  @db.Uuid
  product    Product  @relation(fields: [productId], references: [id])
  category   Category @relation(fields: [categoryId], references: [id])
  @@id([productId, categoryId])
}

model ProductAttribute {
  id     String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name   String
  slug   String           @unique
  values AttributeValue[]
}

model AttributeValue {
  id          String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  attributeId String                 @db.Uuid
  value       String
  slug        String
  attribute   ProductAttribute       @relation(fields: [attributeId], references: [id])
  variants    VariantAttributeValue[]
}

model VariantAttributeValue {
  variantId        String         @db.Uuid
  attributeValueId String         @db.Uuid
  variant          ProductVariant @relation(fields: [variantId], references: [id])
  attributeValue   AttributeValue @relation(fields: [attributeValueId], references: [id])
  @@id([variantId, attributeValueId])
}

model VariantShippingRate {
  id                  String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  variantId           String         @db.Uuid
  country             String
  standardPerProduct  Int
  standardAdditional  Int            @default(0)
  expeditedPerProduct Int
  expeditedAdditional Int            @default(0)
  codPerProduct       Int?
  codAdditional       Int?
  estimatedDays       String?
  variant             ProductVariant @relation(fields: [variantId], references: [id])
  @@unique([variantId, country])
}

model Cart {
  id         String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String?    @unique @db.Uuid
  sessionId  String?    @unique
  couponCode String?
  user       User?      @relation(fields: [userId], references: [id])
  items      CartItem[]
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

model CartItem {
  id        String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  cartId    String         @db.Uuid
  variantId String         @db.Uuid
  quantity  Int            @default(1)
  cart      Cart           @relation(fields: [cartId], references: [id])
  variant   ProductVariant @relation(fields: [variantId], references: [id])
  @@unique([cartId, variantId])
}

model Order {
  id                String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderNumber       String            @unique
  customerId        String?           @db.Uuid
  email             String
  phone             String
  status            OrderStatus       @default(PENDING_PAYMENT)
  paymentStatus     PaymentStatus     @default(PENDING)
  fulfillmentStatus FulfillmentStatus @default(UNFULFILLED)
  currency          String            @default("INR")
  subtotalInPaise   Int
  discountInPaise   Int               @default(0)
  shippingInPaise   Int               @default(0)
  taxInPaise        Int               @default(0)
  grandTotalInPaise Int
  couponCode        String?
  notes             String?
  ipCountry         String?
  placedAt          DateTime?
  deletedAt         DateTime?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  customer          User?             @relation(fields: [customerId], references: [id])
  items             OrderItem[]
  addresses         OrderAddress[]
  payments          Payment[]
  statusHistory     OrderStatusHistory[]
  shipments         Shipment[]
  invoice           Invoice?
}

enum OrderStatus       { PENDING_PAYMENT PAID PROCESSING PACKED SHIPPED DELIVERED CANCELLED REFUNDED }
enum PaymentStatus     { PENDING AUTHORIZED CAPTURED FAILED REFUNDED PARTIALLY_REFUNDED }
enum FulfillmentStatus { UNFULFILLED PARTIAL FULFILLED RETURNED }

model OrderItem {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId         String         @db.Uuid
  variantId       String         @db.Uuid
  skuSnapshot     String
  nameSnapshot    String
  qtyOrdered      Int
  unitPriceInPaise Int
  discountInPaise  Int           @default(0)
  taxInPaise       Int           @default(0)
  lineTotalInPaise Int
  order           Order          @relation(fields: [orderId], references: [id])
  variant         ProductVariant @relation(fields: [variantId], references: [id])
}

model OrderAddress {
  id         String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId    String      @db.Uuid
  type       AddressType
  fullName   String
  phone      String
  line1      String
  line2      String?
  city       String
  state      String
  postalCode String
  country    String
  order      Order       @relation(fields: [orderId], references: [id])
}

enum AddressType { BILLING SHIPPING }

model OrderStatusHistory {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId    String   @db.Uuid
  fromStatus String?
  toStatus   String
  reason     String?
  changedBy  String?  @db.Uuid
  createdAt  DateTime @default(now())
  order      Order    @relation(fields: [orderId], references: [id])
}

model Payment {
  id                String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId           String          @db.Uuid
  provider          PaymentProvider
  providerOrderId   String?
  providerPaymentId String?
  amountInPaise     Int
  currency          String          @default("INR")
  status            PaymentStatus   @default(PENDING)
  gatewayFeeInPaise Int             @default(0)
  settledInPaise    Int             @default(0)
  settlementDate    DateTime?
  refundedInPaise   Int             @default(0)
  rawPayload        Json?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  order             Order           @relation(fields: [orderId], references: [id])
  refunds           Refund[]
}

enum PaymentProvider { RAZORPAY STRIPE PAYPAL COD }

model Refund {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  paymentId        String   @db.Uuid
  amountInPaise    Int
  reason           String?
  providerRefundId String?
  status           String   @default("pending")
  createdAt        DateTime @default(now())
  payment          Payment  @relation(fields: [paymentId], references: [id])
}

model Invoice {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId   String   @unique @db.Uuid
  invoiceNo String   @unique
  pdfUrl    String?
  issuedAt  DateTime @default(now())
  order     Order    @relation(fields: [orderId], references: [id])
}

model Shipment {
  id          String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orderId     String         @db.Uuid
  courier     String
  awb         String?
  trackingUrl String?
  status      ShipmentStatus @default(CREATED)
  deliveredAt DateTime?
  rtoAt       DateTime?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  order       Order          @relation(fields: [orderId], references: [id])
}

enum ShipmentStatus { CREATED PICKED INTRANSIT OUT_FOR_DELIVERY DELIVERED RTO }

model Coupon {
  id              String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code            String     @unique
  type            CouponType
  value           Int
  minOrderInPaise Int        @default(0)
  maxUsageTotal   Int?
  maxUsagePerUser Int        @default(1)
  usageCount      Int        @default(0)
  validFrom       DateTime?
  validUntil      DateTime?
  isActive        Boolean    @default(true)
  createdAt       DateTime   @default(now())
}

enum CouponType { PERCENTAGE FIXED }

model Review {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  productId  String   @db.Uuid
  userId     String   @db.Uuid
  rating     Int
  title      String?
  body       String?
  isVerified Boolean  @default(false)
  isApproved Boolean  @default(false)
  createdAt  DateTime @default(now())
  product    Product  @relation(fields: [productId], references: [id])
  user       User     @relation(fields: [userId], references: [id])
}

model Wishlist {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @db.Uuid
  productId String   @db.Uuid
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  product   Product  @relation(fields: [productId], references: [id])
  @@unique([userId, productId])
}

model Course {
  id             String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug           String       @unique
  title          String
  description    String?
  priceInPaise   Int          @default(0)
  isFree         Boolean      @default(false)
  imageUrl       String?
  status         CourseStatus @default(DRAFT)
  seoTitle       String?
  seoDescription String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  lessons        Lesson[]
  enrollments    Enrollment[]
}

enum CourseStatus { DRAFT PUBLISHED ARCHIVED }

model Lesson {
  id       String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  courseId String  @db.Uuid
  title    String
  videoUrl String?
  duration Int?
  position Int     @default(0)
  isFree   Boolean @default(false)
  course   Course  @relation(fields: [courseId], references: [id])
}

model Enrollment {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String    @db.Uuid
  courseId    String    @db.Uuid
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  user        User      @relation(fields: [userId], references: [id])
  course      Course    @relation(fields: [courseId], references: [id])
  @@unique([userId, courseId])
}

model Event {
  id             String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug           String      @unique
  title          String
  description    String?
  startDate      DateTime
  endDate        DateTime?
  venue          String?
  isOnline       Boolean     @default(false)
  zoomLink       String?
  priceInPaise   Int         @default(0)
  imageUrl       String?
  status         EventStatus @default(DRAFT)
  seoTitle       String?
  seoDescription String?
  createdAt      DateTime    @default(now())
  bookings       Booking[]
}

enum EventStatus { DRAFT PUBLISHED CANCELLED }

model Booking {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @db.Uuid
  eventId   String   @db.Uuid
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  event     Event    @relation(fields: [eventId], references: [id])
}

model Vaidya {
  id             String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug           String  @unique
  name           String
  bio            String?
  photoUrl       String?
  speciality     String?
  seoTitle       String?
  seoDescription String?
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
}

model Mentor {
  id             String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug           String  @unique
  name           String
  bio            String?
  photoUrl       String?
  expertise      String?
  seoTitle       String?
  seoDescription String?
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
}

model Retreat {
  id             String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug           String  @unique
  title          String
  description    String?
  imageUrl       String?
  location       String?
  duration       String?
  priceInPaise   Int?
  seoTitle       String?
  seoDescription String?
  isActive       Boolean @default(true)
  createdAt      DateTime @default(now())
}

model BlogPost {
  id             String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  slug           String     @unique
  title          String
  content        String
  excerpt        String?
  imageUrl       String?
  status         PostStatus @default(DRAFT)
  publishedAt    DateTime?
  seoTitle       String?
  seoDescription String?
  seoKeyword     String?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
}

enum PostStatus { DRAFT PUBLISHED ARCHIVED }

model OtpCode {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  target    String
  code      String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}
```

---

## 6. WOOCOMMERCE PRODUCT DATA (Already Analysed)

```
Total products:       169 (137 variable + 32 simple)
Total variants:       1037
Products with audio:  38 (singing bowls, instruments)
Products with accordion: 169 (every product)
Products with custom shipping: 160
GST classes:          standard, gst-5, gst12, gst-zero-rate, gst18

Categories:
- Sound & Musical Instruments
- Eco-Living & Sustainable
- Yoga & Meditation
- Ayurveda & Herbs
- Personal Care

Pricing zones per product (from CSV columns):
- India:  _india_regular_price + _india_sale_price (INR)
- US:     _dollars-zone_regular_price + _dollars-zone_sale_price (USD)
- GB:     separate GBP pricing
- Other:  falls back to USD

Per-product shipping per country (IN, US, GB, OTHER):
- shipping_prices_{n}_standard_shipping_per_product
- shipping_prices_{n}_standard_shipping_additional_product
- shipping_prices_{n}_expedited_shipping_per_product
- shipping_prices_{n}_cod_for_india_shipping_per_product

Active payment gateways on current site:
- Razorpay (Active) — India
- Stripe (Active) — International
- PayPal Standard (Active) — International
- UPI QR Code (Inactive)

Current WordPress errors (selling points for migration):
- Apple Pay domain registration failed
- Tax configuration incomplete (GST not configured)
- Zoom API disconnected
- Theme has outdated WooCommerce files (security risk)
```

---

## 7. SEO — NEVER BREAK THESE RULES

### SEO Implementation Status (Completed)
- ✅ All 7 SEO prompts implemented
- ✅ `SeoAnalysisPanel` built (Yoast equivalent) in admin product form
- ✅ 169 products SEO data migrated from Yoast
- ✅ `seoTitle`, `seoDescription`, `seoKeyword` populated for migrated Woo products
- ✅ `stripHtml` applied to seeded SEO descriptions
- ✅ Sitemap extended with blog / vaidya / mentor / retreat / offers
- ✅ 301 redirects added in `frontend/next.config.js`
- ✅ Policy pages created (`/privacy`, `/terms`, `/shipping`, `/refunds`)
- ✅ `noindex` applied on transactional pages

### URL Preservation (Must match WooCommerce exactly)
```
/product/[slug]              NEVER → /products/[slug]
/product-category/[slug]     NEVER change
/shop                        NEVER → /store
/course/[slug]               NEVER change
/event/[slug]                NEVER change
/vaidya/[slug]               NEVER change
/mentor/[slug]               NEVER change
/retreat/[slug]              NEVER change
/cart                        NEVER change
/checkout                    NEVER change
/my-account                  NEVER change
/[blog-slug]                 NEVER change
/offers/[slug]               NEVER change
```

### 22 Sitemaps to Recreate at Launch
```
post, page, product, product_cat, product_tag,
course, event, vaidya, mentor, retreat, blog,
testimonial, asp-products, zoom-meetings,
variables_post, offers_post, category, post_tag,
specialities, product_shipping_class,
special_tags-category, author
```

### Every Page Must Have (generateMetadata in Next.js)
```typescript
export async function generateMetadata({ params }) {
  return {
    title: `${item.seoTitle || item.name} | Sarveda`,
    description: item.seoDescription,
    keywords: item.seoKeyword,
    alternates: { canonical: `https://sarveda.com/${type}/${params.slug}` },
    openGraph: {
      title: item.seoTitle || item.name,
      description: item.seoDescription,
      images: [item.imageUrl],
      siteName: 'Sarveda',
    },
  };
}
```

### JSON-LD Per Page Type
```
Product:   Product schema + AggregateRating + BreadcrumbList
Course:    Course schema + BreadcrumbList
Event:     Event schema + BreadcrumbList
Blog:      Article schema + BreadcrumbList
Homepage:  Organization + WebSite
Vaidya:    Person + BreadcrumbList
```

---

## 8. BUSINESS RULES

### Money (CRITICAL)
```typescript
// ALL money stored as INTEGER paise. NEVER float.
const toPaise   = (rupees: number) => Math.round(rupees * 100);
const toRupees  = (paise: number)  => paise / 100;
const formatINR = (paise: number)  => `₹${(paise/100).toLocaleString('en-IN')}`;
```

### GST (Prices in DB are GST-inclusive)
```typescript
const GST_RATES: Record<string, number> = {
  'standard': 18, 'gst18': 18,
  'gst12': 12, 'gst-5': 5, 'gst-zero-rate': 0,
};
```

### Currency Zone
```typescript
type Zone = 'IN' | 'US' | 'GB' | 'OTHER';
// Detect from IP → cookie
// IN  → show INR, Razorpay + COD
// US  → show USD, Stripe + PayPal
// GB  → show GBP, Stripe + PayPal
// OTHER → show USD, Stripe + PayPal
```

### Order Number
```
Format: SRV-{YEAR}{MONTH}{5-digit-seq}
Example: SRV-2026060001
```

### Payment Rules
```
India:         Razorpay (primary) + COD
International: Stripe (primary) + PayPal Standard
COD:           India only, check per-product availability
Webhooks:      Must be idempotent (check if already processed)
```

### Shipping Auto-Router
```
weight > 5kg + Zone A          → Delhivery
orderValue > ₹3000 + metro     → Bluedart
COD + non-metro                → DTDC
default                        → Shiprocket
```

### WhatsApp Triggers (WATI)
```
Order confirmed   → immediate
AWB generated     → immediate
Out for delivery  → immediate
Delivered         → immediate
Refund initiated  → immediate
Abandoned cart    → 2 hour delay
```

---

## PRODUCTION STANDARDS — NON NEGOTIABLE

### Payment Handling (Bulletproof)
- Every payment failure shows specific user-friendly message
- Card declined: "Your card was declined. Please try another card"
- Insufficient funds: "Insufficient funds. Please try another payment method"
- Network timeout: "Connection timeout. Your money is safe, please retry"
- Bank timeout: "Bank is taking longer than usual. Check orders in 10 minutes"
- NEVER create duplicate orders on retry
- Payment pending timeout: 15 minutes then auto-cancel + release stock
- Webhook idempotency: check providerPaymentId before processing
- Always verify Razorpay signature on every webhook
- Store raw webhook payload in DB for reconciliation
- Retry mechanism: 3 attempts with exponential backoff

### Order Lifecycle (Complete)
```
PENDING_PAYMENT → PAID → PROCESSING → PACKED → SHIPPED → DELIVERED
                       → CANCELLED (payment failed/timeout)
                       → REFUNDED (after delivery)
```

### Notifications (Every Event)
Trigger email + WhatsApp for:
- Order confirmed (immediate)
- Payment failed (immediate + retry link)
- Order processing (same day)
- Order shipped (with AWB + tracking URL)
- Out for delivery (morning of delivery)
- Order delivered (with review request)
- Refund initiated (with timeline)
- Abandoned cart (2 hours after adding, not purchased)

WhatsApp: WATI API  
Email: SendGrid  
Both must fire for every event  
Templates must be warm, professional, in English

### Shipping (Automated)
- Shiprocket as primary hub (connects all couriers)
- Auto-select courier based on: weight + zone + price
- Auto-generate AWB on order PROCESSING status
- Tracking page at /track/[awb]
- Pincode serviceability check before checkout
- Estimated delivery date on product page + checkout
- RTO handling: auto-update order status

### GST Invoice (Mandatory)
- Auto-generate PDF on order PAID
- Show: seller details, buyer details, items, HSN codes, CGST/SGST/IGST breakdown, total
- Downloadable from order page
- Emailed automatically with order confirmation

### Stock Management
- Reserve stock on checkout initiated
- Release if payment not completed in 15 min
- Decrement on payment confirmed
- Increment on cancellation/refund
- Low stock alert to admin at threshold (5 units)
- Out of stock: disable Add to Cart, show "Notify me"
- Overselling prevention: check stock before payment

### Search
- Search bar in header (all pages)
- Real-time suggestions as user types (debounced 300ms)
- Search by: product name, category, description
- Show product image + price in suggestions
- Full search results page at /search?q=

### UX Standards (World Class)
- Page load: under 2 seconds on mobile
- No layout shift (CLS score < 0.1)
- Skeleton loaders on all data fetching
- Smooth transitions between pages
- Sticky Add to Cart on product page (mobile)
- Image zoom on product page (click/pinch)
- Recently viewed products (localStorage)
- Trust badges on checkout: Secure | Encrypted | Safe
- Progress indicator on checkout steps
- Mobile checkout: maximum 3 taps to payment

### Error Handling (User Friendly)
- Never show technical errors to users
- Every error has: clear message + action button
- 404 page: branded with search + popular products
- 500 page: branded with contact support option
- Network error: "Check your connection and retry"

### Security (Production Grade)
- Rate limiting: 5 login attempts per 15 minutes
- JWT rotation on suspicious activity
- All inputs sanitized and validated (Zod)
- SQL injection prevention (Prisma handles)
- XSS prevention (React handles + CSP headers)
- CORS: allow listed origins (`FRONTEND_URL` comma-separated + optional `CORS_ORIGINS`) — staging `https://sarveda-demo.xyz`, Vercel preview/production hosts

### Performance Targets
- Lighthouse score: 90+ on mobile
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- API response time: < 200ms for product listing

---

## 9. CODE CONVENTIONS

```typescript
// API Response
{ success: true, data: any, message?: string }
{ success: false, error: string, code: string }

// Never console.log — use logger
import { logger } from '../config/logger';
logger.info('event', { context });

// Async routes
router.get('/:id', async (req, res, next) => {
  try {
    const data = await service.find(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// JWT: 7d expiry, HTTP-only cookie, SameSite=strict
// Passwords: bcrypt 12 rounds
// All inputs: Zod validation
```

---

## 10. ISKCON CODEBASE REUSE

```
utils/jwt.ts          → 95% — copy directly
utils/hash.ts         → 100% — copy directly
utils/otp.ts          → 70% — adapt provider
middleware/auth.ts    → 85% — update User type
middleware/rateLimiter → 100% — copy directly
modules/auth/         → 80% — adapt schema
modules/payments/     → 78% — rename + add Stripe
modules/cart/         → 72% — redesign for products
app.ts security       → 70% — helmet, cors, limits
```

---

## 11. ENVIRONMENT VARIABLES

```env
DATABASE_URL=postgresql://sarveda:password@localhost:5432/sarveda_db
# BullMQ payment-timeout + checkout Idempotency-Key cache (required on EC2 for 15 min cancel)
REDIS_URL=redis://localhost:6379
JWT_SECRET=min-32-chars-secret
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=sandbox
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
AWS_S3_REGION=us-east-1
AWS_S3_BUCKET_NAME=sarveda-media
# Public media base (staging often direct S3): https://sarveda-media.s3.amazonaws.com
AWS_CLOUDFRONT_URL=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=hello@sarveda.com
WATI_API_KEY=
WATI_BASE_URL=https://live-mt-server.wati.io
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
DELHIVERY_API_KEY=
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
# Staging primary origin (comma-separated): https://sarveda-demo.xyz
# Optional extra browser origins: CORS_ORIGINS=https://sarveda-frontend.vercel.app
GOOGLE_CALLBACK_URL=https://sarveda-demo.xyz/api/auth/google/callback
NEXT_PUBLIC_API_URL=http://localhost:5000
# Production: public site URL for server-side /api fetches (else Vercel sets VERCEL_URL)
# NEXT_PUBLIC_SITE_URL=https://sarveda.com
# Staging demo: NEXT_PUBLIC_SITE_URL=https://sarveda-demo.xyz
NEXT_PUBLIC_MEDIA_CDN_URL=https://sarveda-media.s3.amazonaws.com
NEXT_PUBLIC_RAZORPAY_KEY_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
SENTRY_DSN=
```

---

## 12. 10-DAY DEMO SPRINT (Target: May 20)

```
Day 1:  docker-compose + Prisma schema + migrate + Express boilerplate
Day 2:  Auth (register, login, OTP, JWT, Google OAuth)
Day 3:  Products API + CSV seed (169 products imported)
Day 4:  Next.js setup + /shop product listing page
Day 5:  /product/[slug] — gallery + audio player + variants + accordion
Day 6:  Cart API + CartDrawer (slide-in, no reload)
Day 7:  Checkout page (address + shipping + coupon)
Day 8:  Razorpay test payment → order created → confirmation
Day 9:  Admin — product list + order list + deploy Railway
Day 10: 🎯 Staging URL ready → send to Arjun
```

---

## 13. CURRENT BUILD STATUS (Updated May 19, 2026)

✅ Auth system (register/login/OTP/JWT)  
✅ 169 products + 1069 variants on AWS RDS  
✅ Shop + product detail pages (PDP redesign in progress — see section 0)  
✅ Cart + checkout flow  
✅ Razorpay + Stripe + PayPal integrated  
✅ Order confirmation page  
✅ Admin panel (products/orders/inventory) — dashboard KPIs, pagination, workspace light/dark toggle, full-width layout  
✅ AWS EC2 Mumbai backend (13.206.192.106:5000)  
✅ AWS RDS PostgreSQL Mumbai  
✅ Vercel frontend (sarveda-frontend.vercel.app)  
✅ Staging custom domain: https://sarveda-demo.xyz (Vercel; `/api` proxied to EC2)  
✅ Storefront `/login` + `/signup` with Google OAuth + email/password  
✅ Redis running on EC2  
✅ Vercel `/api/*` rewrite → EC2 Express (`next.config.js`; browser uses same-origin `/api`)  
✅ Day 1: Payment hardening (Razorpay India)  
✅ Razorpay webhook endpoint + signature verify + idempotent `providerPaymentId`  
✅ Stock reserve on checkout / release on fail or timeout / confirm on paid  
✅ Payment timeout job (BullMQ, 15 min `PENDING_PAYMENT` → cancel + release stock)  
✅ Checkout idempotency (`Idempotency-Key` header + Redis; Razorpay order notes `idempotency_key`)  
✅ Client verify path `POST /api/payments/razorpay/verify` + 30s order poll if webhook slow  
✅ `/payment-failed` page + resume unpaid order (`GET /api/checkout/resume`)  
✅ Cart kept until payment succeeds; dismiss/back navigation does not wipe cart  
✅ Pending checkout in `sessionStorage` (`sarveda_pending_checkout`)  
✅ S3 media migration script + `AWS_S3_REGION` fix (`backend/scripts/migrate-media-to-s3.ts`)  
✅ Staging media via `NEXT_PUBLIC_MEDIA_CDN_URL` + `frontend/lib/media-cdn.ts`  
✅ Corporate wellness CMS pages, list pages (vaidya/mentor/retreat/offers), testimonials API  
✅ Product-category ISR fix (Vercel `DYNAMIC_SERVER_USAGE`)  
🔄 PDP: Amazon-style 3-column (`ProductDetailExperience`, `ProductBuyBox`), pincode removed, S3 audio  

⬜ **Next:** PDP user feedback + variant attributes import + reviews on PDP
⬜ **LMS (future):** lesson player, enrolled-only video/content, progress — admin course enrollments list at `/admin/enrollments` ✅  
⬜ Confirm Razorpay + Google OAuth env on EC2/Vercel for `sarveda-demo.xyz`  
⬜ Email + WhatsApp + GST Invoice, Shiprocket E2E, SEO sitemaps  

---

## 16. PAYMENT, CHECKOUT & API ROUTING (Implemented May 11, 2026)

### How the browser talks to the API
- **Local:** Next dev rewrites `/api/*` → `http://127.0.0.1:5000/api/*` (override with `BACKEND_PROXY_URL`).
- **Vercel:** rewrites `/api/*` → `http://13.206.192.106:5000/api/*` when `VERCEL` is set.
- **`frontend/lib/api.ts` `getApiBase()`:** browser returns `""` (same-origin `/api/...`); production server uses `NEXT_PUBLIC_SITE_URL` or `https://${VERCEL_URL}` so RSC fetches hit the deployment host, not raw EC2.
- **No** Next.js Route Handler at `frontend/app/api/payments/webhook/razorpay/route.ts` — webhooks hit Express only (Vercel proxies the path).

### Razorpay — two paths (both intentional)
1. **Primary (shopper):** Checkout opens Razorpay → success handler → **`POST /api/payments/razorpay/verify`** (HMAC signature) → order **PAID**, cart cleared, stock confirmed.
2. **Backup (server):** **`POST /api/payments/razorpay/webhook`** (HMAC with `RAZORPAY_WEBHOOK_SECRET`, raw JSON body in `app.ts` before `express.json()`). Handles **`payment.captured`**, **`payment.failed`**, **`refund.created`**, **`refund.processed`**. Duplicate `providerPaymentId` → **200** idempotent. Payload merged into `Payment.rawPayload`.

**Razorpay Dashboard webhook URL (path must match):** `https://sarveda-demo.xyz/api/payments/razorpay/webhook` (staging) or production host at launch. Subscribe at least **`payment.captured`** and **`payment.failed`**. Test-mode keys and test-mode webhook must match.

**Google OAuth (staging):** Authorized redirect URI `https://sarveda-demo.xyz/api/auth/google/callback`; backend `FRONTEND_URL` primary origin `https://sarveda-demo.xyz`.

**Key backend files:** `modules/payments/razorpay.ts`, `razorpay.verify.ts`, `razorpay.webhook.ts`, `modules/orders/orders.service.ts`, `jobs/paymentTimeoutJob.ts`, `modules/checkout/checkout.service.ts`.

### Checkout navigation & cart (failure / back button)
- **`create-order` does not delete cart lines** — cart clears only after successful verify (`clearCartForRequest` on verify; logged-in cart also cleared in `completePaidOrder`).
- **`GET /api/checkout/resume?orderNumber=&email=`** reopens the same unpaid Razorpay order (no duplicate Sarveda order on retry).
- **`frontend/lib/pending-checkout.ts`** stores pending order in **`sessionStorage`**; Razorpay modal dismiss → **`/payment-failed`** with order context; retry links to **`/checkout?orderNumber=&email=`**.
- Checkout **`pageshow`** refreshes cart when user returns via back/forward cache.

### Admin (same sprint)
- Dashboard load fixed (no `AbortController` abort under React Strict Mode).
- Shared **`AdminPagination`** on orders, products, inventory; inventory API paginated.
- **`AdminShell`** full-width content; workspace light/dark toggle (`darkMode: 'class'`, `sarveda-admin-theme` in `localStorage`).

### Still not built (payment-adjacent)
- SendGrid / WATI on pay success or fail (Day 2).
- Settlement **reconciliation** UI (payloads stored only).
- COD checkout path (payment-failed page links back to checkout only).
- Stripe / PayPal webhook parity with Razorpay hardening.

---


## 14. DEPLOYMENT FLOW (How to update production)

**Frontend changes:**
```
git add . && git commit -m "message" && git push
→ Vercel auto-deploys in ~2 minutes
```

**Backend changes:**
```
git push (local)
Then SSH to EC2:
ssh -i ~/.ssh/sarveda-key.pem ubuntu@13.206.192.106
cd ~/sarveda && git pull origin main
cd backend && npm install && npm run build
pm2 restart sarveda-backend
```

---

## 15. AWS INFRASTRUCTURE

| Resource | Value |
|----------|--------|
| EC2 | 13.206.192.106 (Mumbai ap-south-1) |
| RDS | sarveda-db.ct2kuyqkyegn.ap-south-1.rds.amazonaws.com |
| Redis | localhost:6379 (on EC2) |
| Frontend | Vercel (auto-deploy from GitHub `main`) |
| GitHub | github.com/sarvedaonlineshop-max/sarveda |

---

*Sarveda | Developer: Shivakumar M | Client: Arjun | May 19, 2026*
*AI Advisor: Claude (Anthropic) via Cursor*
