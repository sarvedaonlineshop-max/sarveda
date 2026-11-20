#!/usr/bin/env python3
"""Generate Sarveda development-fee quote workbook (INR) as of 20 Nov 2026.

Run from repo root:
  python3 docs/commercial/generate_development_fee_quote.py
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.page import PageMargins

OUT = Path(__file__).with_name("Sarveda_Development_Fee_Quote_Till_2026-11-20.xlsx")

QUOTE_NO = "SRV-DEV-2026-001"
QUOTE_DATE = date(2026, 11, 20)
PERIOD = "May 2026 – 20 November 2026"
GST_RATE = 0.18
HOURLY_REF = 2500  # transparency only; quote is value-based
# Catch-up invoice (quoted). Market column keeps full agency replacement cost.
QUOTED_TOTAL = 8_500_000

# Brand
GREEN = "1B4332"
GREEN_MID = "2D6A4F"
GOLD = "B08968"
CREAM = "F7F4EE"
INK = "1A1A1A"
MUTED = "5C5C5C"
WHITE = "FFFFFF"
LINE = "D6D3CD"
RED_SOFT = "FCECEC"
AMBER = "FFF4D6"
TOTAL_BG = "081C15"

thin = Border(
    left=Side(style="thin", color=LINE),
    right=Side(style="thin", color=LINE),
    top=Side(style="thin", color=LINE),
    bottom=Side(style="thin", color=LINE),
)
thick_bottom = Border(bottom=Side(style="medium", color=GREEN))

fill_green = PatternFill("solid", fgColor=GREEN)
fill_mid = PatternFill("solid", fgColor=GREEN_MID)
fill_gold = PatternFill("solid", fgColor=GOLD)
fill_cream = PatternFill("solid", fgColor=CREAM)
fill_white = PatternFill("solid", fgColor=WHITE)
fill_total = PatternFill("solid", fgColor=TOTAL_BG)
fill_amber = PatternFill("solid", fgColor=AMBER)
fill_cat = PatternFill("solid", fgColor="E8F0EC")
fill_sub = PatternFill("solid", fgColor="EEF6F1")

font_title = Font(name="Calibri", size=20, bold=True, color=GREEN)
font_h = Font(name="Calibri", size=12, bold=True, color=WHITE)
font_h_dark = Font(name="Calibri", size=12, bold=True, color=GREEN)
font_body = Font(name="Calibri", size=10, color=INK)
font_bold = Font(name="Calibri", size=10, bold=True, color=INK)
font_muted = Font(name="Calibri", size=9, italic=True, color=MUTED)
font_white_bold = Font(name="Calibri", size=11, bold=True, color=WHITE)
font_gold = Font(name="Calibri", size=11, bold=True, color=GREEN)
inr = '"₹"#,##,##0'
pct = "0%"
wrap = Alignment(wrap_text=True, vertical="center")
left = Alignment(vertical="center", wrap_text=True)
center = Alignment(horizontal="center", vertical="center", wrap_text=True)
right = Alignment(horizontal="right", vertical="center")


# ---------------------------------------------------------------------------
# Line items — every delivered commercial module. Amounts are professional
# replacement-cost fees in INR (ex-GST), not AWS vendor invoices.
# ---------------------------------------------------------------------------

# (code, workstream, module, delivered, complexity, amount)
MODULES: list[tuple[str, str, str, str, str, int]] = [
    # A Foundation
    (
        "A1",
        "01 — Platform foundation",
        "Custom stack: Next.js 14 + Express + TypeScript + PostgreSQL/Prisma + Redis/BullMQ",
        "Monorepo, Docker local Postgres/Redis, env validation, API response contract, 125 Prisma migrations, Dependabot.",
        "L",
        250000,
    ),
    (
        "A2",
        "01 — Platform foundation",
        "Auth: JWT httpOnly cookies, roles, Google OAuth, phone OTP (MSG91), password reset",
        "Storefront login/signup, admin gates, staff/accounting allowlists, rate-limited OTP and login.",
        "L",
        225000,
    ),
    (
        "A3",
        "01 — Platform foundation",
        "Security hardening after WordPress breach (Jul 2026)",
        "Helmet/HSTS, locked CORS, Zod on APIs, no execute-on-upload (S3 only), Turnstile on enquiries, admin activity log, webhook HMAC, rate limits.",
        "L",
        175000,
    ),
    (
        "A4",
        "01 — Platform foundation",
        "Automated test harness (commerce + accounting + CRM)",
        "80+ Vitest suites: checkout, refunds, RTO, drop-ship, merchant feeds, journals, cutover boundary, API security.",
        "L",
        200000,
    ),
    (
        "A5",
        "01 — Platform foundation",
        "Background jobs platform",
        "Payment timeout, stock reconcile, email/WhatsApp queues, shipping retry, tracking sync, marketplace sync, enquiry follow-up, accounting discovery workers.",
        "L",
        150000,
    ),
    # B Storefront
    (
        "B1",
        "02 — Storefront (customer shop)",
        "Homepage + shop listing + category PLP",
        "Hero/categories/journal/newsletter, /shop filters + infinite grid, /product-category/[slug] with child categories, zone price display.",
        "L",
        250000,
    ),
    (
        "B2",
        "02 — Storefront (customer shop)",
        "Product detail page (Amazon-style 3-column PDP)",
        "Sticky gallery, S3 audio player, variants, pair-with, accordion, buy box, delivery timeline, JSON-LD, reviews section.",
        "L",
        275000,
    ),
    (
        "B3",
        "02 — Storefront (customer shop)",
        "Cart (guest + logged-in) + slide-in drawer",
        "Session cart, coupon apply, drop-ship vs warehouse qty rules, no wipe on payment-fail back navigation.",
        "M",
        150000,
    ),
    (
        "B4",
        "02 — Storefront (customer shop)",
        "Checkout: address, shipping, multi-currency, payment selector",
        "IN/US/GB/OTHER zones (INR/USD/GBP), shipping rates, Razorpay/Stripe/PayPal/COD selector, pending checkout, resume unpaid order.",
        "XL",
        350000,
    ),
    (
        "B5",
        "02 — Storefront (customer shop)",
        "Search (header suggestions + results page)",
        "Debounced API, image+price suggestions, /search?q=.",
        "M",
        100000,
    ),
    (
        "B6",
        "02 — Storefront (customer shop)",
        "Customer account, profile, order history, self-service",
        "/my-account, /profile, cancel / return / adjust request flows.",
        "L",
        175000,
    ),
    (
        "B7",
        "02 — Storefront (customer shop)",
        "Order confirmation, cancellation, details, payment-failed, public tracking",
        "/order/confirmed|cancelled|details, /payment-failed, /track/[awb].",
        "M",
        100000,
    ),
    (
        "B8",
        "02 — Storefront (customer shop)",
        "Policy, contact, newsletter, PWA shell",
        "/privacy /terms /shipping /refunds, contact forms, newsletter subscribe, app version API.",
        "S",
        75000,
    ),
    # C Catalog
    (
        "C1",
        "03 — Catalog & merchandising",
        "Products, variants, attributes, GST tax class, HSN, IN/US/GB pricing",
        "Simple/variable/digital types, per-variant shipping matrix, pair-with relations, status lifecycle.",
        "L",
        250000,
    ),
    (
        "C2",
        "03 — Catalog & merchandising",
        "Product media, audio, accordion content",
        "S3 images, primary/position, 38+ audio products, accordion on catalog.",
        "M",
        125000,
    ),
    (
        "C3",
        "03 — Catalog & merchandising",
        "Admin product form + Yoast-style SEO panel + XL bulk sheet",
        "Full variant editor, media upload, SeoAnalysisPanel, spreadsheet bulk edit.",
        "L",
        250000,
    ),
    (
        "C4",
        "03 — Catalog & merchandising",
        "Drop-shipping V1 (warehouse vs vendor stock)",
        "Per-variant dropShipEnabled, checkout allocation, shipping uses warehouse units, import workbook + Lightsail cert.",
        "L",
        175000,
    ),
    (
        "C5",
        "03 — Catalog & merchandising",
        "Catalog-gap reports vs live WooCommerce",
        "Admin catalog-gaps workspace + compare tooling against DigitalOcean Woo.",
        "M",
        100000,
    ),
    # D Payments
    (
        "D1",
        "04 — Payments",
        "Razorpay (India) — create, client verify, webhook, HMAC",
        "payment.captured/failed, idempotent providerPaymentId, raw payload stored.",
        "L",
        200000,
    ),
    (
        "D2",
        "04 — Payments",
        "Stripe Checkout (international)",
        "Checkout session, webhook, ID resolve/sync.",
        "L",
        175000,
    ),
    (
        "D3",
        "04 — Payments",
        "PayPal Standard",
        "Redirect flow, return page, webhook complete handler.",
        "M",
        125000,
    ),
    (
        "D4",
        "04 — Payments",
        "COD (India) + courier COD amount",
        "COD as payment provider; Delhivery COD on labels; India-only gate.",
        "M",
        75000,
    ),
    (
        "D5",
        "04 — Payments",
        "Idempotency, 15-min timeout, retry / resume unpaid, supplementary pay",
        "Redis Idempotency-Key, BullMQ cancel+stock release, GET /checkout/resume, payment-failed UX.",
        "L",
        200000,
    ),
    (
        "D6",
        "04 — Payments",
        "Gateway refunds (full/partial) + line allocation",
        "Razorpay refund sync, allocation to order lines, settlement with books.",
        "XL",
        225000,
    ),
    (
        "D7",
        "04 — Payments",
        "Admin payments reconciliation workspace",
        "Gateway recon screen + export.",
        "M",
        100000,
    ),
    # E Orders / shipping
    (
        "E1",
        "05 — Orders & fulfilment",
        "Order lifecycle, SRV numbers, stock reserve/confirm/release",
        "PENDING_PAYMENT→DELIVERED, status history, overselling prevention, reserved reconcile job.",
        "L",
        250000,
    ),
    (
        "E2",
        "05 — Orders & fulfilment",
        "GST tax invoice PDF (domestic) + commercial invoice (intl)",
        "CGST/SGST/IGST from inclusive prices, PDF on S3, admin download/regenerate.",
        "L",
        175000,
    ),
    (
        "E3",
        "05 — Orders & fulfilment",
        "Delivery challans",
        "Numbering, PDF, admin generate/download.",
        "M",
        100000,
    ),
    (
        "E4",
        "05 — Orders & fulfilment",
        "E-way bills",
        "Prepare/cancel/record EBN, transport updates, admin on order.",
        "M",
        125000,
    ),
    (
        "E5",
        "05 — Orders & fulfilment",
        "Multi-courier shipping: Shiprocket + Delhivery, labels, AWB, webhooks",
        "Auto-router, pickup locations, shipment admin, label assets, tracking persist, retry job.",
        "XL",
        350000,
    ),
    (
        "E6",
        "05 — Orders & fulfilment",
        "Split parcels + public AWB tracking page",
        "Customer parcels per order; /track/[awb].",
        "M",
        100000,
    ),
    (
        "E7",
        "05 — Orders & fulfilment",
        "Admin orders, shipments, pickup-location settings",
        "Order list/detail/export, shipment workspace, multi pickup.",
        "L",
        150000,
    ),
    # F Returns
    (
        "F1",
        "06 — Cancellations, refunds, returns, RTO",
        "Returns/cancellations V2 (phases 1A–1E + replacement V2)",
        "Service requests, return cases, QC, economics, courier/vendor claims, RTO, refund calculator, line refunds, pre-dispatch cancel, replacements, SLA analytics.",
        "XL",
        450000,
    ),
    (
        "F2",
        "06 — Cancellations, refunds, returns, RTO",
        "Admin returns desk + customer self-service screens",
        "/admin/returns, analytics; profile cancel/return/adjust.",
        "L",
        125000,
    ),
    # G Inventory
    (
        "G1",
        "07 — Inventory operations",
        "On-hand / reserved / low-stock, XL sheet, stock revisions",
        "Admin inventory, restock, audit revisions, inventory XL.",
        "L",
        175000,
    ),
    (
        "G2",
        "07 — Inventory operations",
        "Back-in-stock “Notify me”",
        "Per-variant signup + notification service.",
        "S",
        40000,
    ),
    # H Content
    (
        "H1",
        "08 — Content, LMS, brand pages",
        "Courses + enrollments admin (LMS foundation)",
        "Course/lesson models, storefront course pages, enroll actions, /admin/enrollments. (Full video player deferred — not billed.)",
        "L",
        175000,
    ),
    (
        "H2",
        "08 — Content, LMS, brand pages",
        "Events + bookings",
        "List/detail, booking model, CMS admin.",
        "M",
        100000,
    ),
    (
        "H3",
        "08 — Content, LMS, brand pages",
        "Vaidya / mentor / retreat / offers directories",
        "List + detail pages, APIs, CMS types, SEO fields.",
        "M",
        125000,
    ),
    (
        "H4",
        "08 — Content, LMS, brand pages",
        "Blog / insights + comments API",
        "Woo URL preserved as /[slug], sitemap, share bar.",
        "M",
        100000,
    ),
    (
        "H5",
        "08 — Content, LMS, brand pages",
        "Corporate wellness + CMS pages + testimonials + WXR import",
        "Corporate program pages, CmsPage, testimonials API, content import scripts.",
        "M",
        125000,
    ),
    (
        "H6",
        "08 — Content, LMS, brand pages",
        "Admin content hub (courses, mentors, pages)",
        "/admin/content typed CMS.",
        "M",
        75000,
    ),
    # I Admin
    (
        "I1",
        "09 — Admin operations console",
        "Admin shell, KPI dashboard, analytics, customers",
        "Role-scoped sidebar, shopper funnel, pagination, light/dark workspace, attribution reports.",
        "L",
        225000,
    ),
    (
        "I2",
        "09 — Admin operations console",
        "Coupons + reviews moderation",
        "Admin CRUD, checkout validation, PDP reviews, verified-purchase flags.",
        "M",
        100000,
    ),
    (
        "I3",
        "09 — Admin operations console",
        "Servers dashboard + admin activity audit log",
        "Owner-only host/PM2/nginx metrics; super-admin mutation log.",
        "M",
        100000,
    ),
    (
        "I4",
        "09 — Admin operations console",
        "Legacy Woo orders + marketplace archives",
        "Read-only old-orders / old-marketplaces for historical ops.",
        "M",
        125000,
    ),
    (
        "I5",
        "09 — Admin operations console",
        "Tasks + complaints desk (whitelist, SLA)",
        "Task assignees, complaint workflow, storefront /complaints, whitelist.",
        "L",
        175000,
    ),
    (
        "I6",
        "09 — Admin operations console",
        "Enquiries / admin chat inbox (anti-spam)",
        "Threaded enquiries, attachments, Turnstile/honeypot, follow-up job, /admin/chats.",
        "L",
        200000,
    ),
    # J Accounting — the Zoho replacement
    (
        "J1",
        "10 — Native accounting (replaces Zoho Books)",
        "General ledger engine: CoA, immutable journals, periods, posting guards",
        "Event-sourced books, production posting flag, sequences, audit log. ~164 backend files.",
        "XL",
        450000,
    ),
    (
        "J2",
        "10 — Native accounting (replaces Zoho Books)",
        "Sales journals: ORDER_PAID, full refund invert, cancelled-order paths",
        "Discover / preview / post; GST output; gateway clearing / AR.",
        "XL",
        300000,
    ),
    (
        "J3",
        "10 — Native accounting (replaces Zoho Books)",
        "Gateway settlement import & posting (Razorpay etc.)",
        "File import, match payments, fees, journals, discovery workers.",
        "L",
        175000,
    ),
    (
        "J4",
        "10 — Native accounting (replaces Zoho Books)",
        "Vendor bills + vendor payments (AP)",
        "Bill journals, input GST, payment allocations.",
        "L",
        200000,
    ),
    (
        "J5",
        "10 — Native accounting (replaces Zoho Books)",
        "Expenses + GL mapping rules",
        "Standalone expenses, account maps, admin UI.",
        "M",
        100000,
    ),
    (
        "J6",
        "10 — Native accounting (replaces Zoho Books)",
        "Banking: accounts, transfers, statement import, period reconciliation",
        "CSV/XLSX statements, line matching, recon lock, gateway clearing control.",
        "XL",
        350000,
    ),
    (
        "J7",
        "10 — Native accounting (replaces Zoho Books)",
        "GST management: ledger, ITC evidence, GSTR-style XLSX reports",
        "Sales/purchase GST, ITC, recon UI. Management reports — not GSTN filing (not billed).",
        "XL",
        350000,
    ),
    (
        "J8",
        "10 — Native accounting (replaces Zoho Books)",
        "Inventory accounting: FIFO layers, capitalization, COGS, reversals, openings",
        "Valuation, recon, write-off paths, high-risk opening batches.",
        "XL",
        350000,
    ),
    (
        "J9",
        "10 — Native accounting (replaces Zoho Books)",
        "Financial statements: Trial Balance, GL, P&L, Balance Sheet, integrity checks",
        "XLSX/PDF export, books integrity.",
        "L",
        200000,
    ),
    (
        "J10",
        "10 — Native accounting (replaces Zoho Books)",
        "Opening balances / cutover packs (AR, AP, bank, GST, inventory, equity)",
        "XLSX upload, typed batches, Lightsail validation scripts.",
        "XL",
        250000,
    ),
    (
        "J11",
        "10 — Native accounting (replaces Zoho Books)",
        "Accounting quotations + proforma invoice PDF",
        "Quote CRUD, revisions, convert, proforma title on same number.",
        "L",
        150000,
    ),
    (
        "J12",
        "10 — Native accounting (replaces Zoho Books)",
        "Purchases ops: vendors, PO, goods receipt, bills, expenses UI",
        "Purchase numbers, receipts, bills, vendor master — feeds AP journals.",
        "L",
        225000,
    ),
    (
        "J13",
        "10 — Native accounting (replaces Zoho Books)",
        "Zoho Books integration (built, then retired as live ledger)",
        "Full client: items, inventory, invoices, financials, webhooks, historical import. Work delivered; native books are now the authority.",
        "XL",
        250000,
    ),
    # K CRM
    (
        "K1",
        "11 — CRM",
        "Leads, deals, pipeline, companies, contacts, customer 360",
        "Full CRM REST, convert lead, directory UIs, 30+ services.",
        "XL",
        350000,
    ),
    (
        "K2",
        "11 — CRM",
        "CRM tasks, activities, reports",
        "Task service, activity log, CRM reports screens.",
        "L",
        125000,
    ),
    (
        "K3",
        "11 — CRM",
        "Chat pipeline, order desk, lead payments / receipts",
        "Enquiry pipeline, owner/collaborators, desk feedback/issues.",
        "XL",
        200000,
    ),
    (
        "K4",
        "11 — CRM",
        "Commercial quotations desk (CRM-linked)",
        "Admin quotations list/detail linked to CRM + accounting quotes.",
        "M",
        100000,
    ),
    # L Channels
    (
        "L1",
        "12 — Messaging & notifications",
        "WhatsApp (Exotel) bot: orders, track, pay, agent handoff",
        "Inbound webhook, interactive menus, idle job, enquiry flags. Live channel.",
        "L",
        250000,
    ),
    (
        "L2",
        "12 — Messaging & notifications",
        "WhatsApp Flow v2 (encrypted) + agent sessions",
        "Crypto endpoint, token, support data pack.",
        "M",
        100000,
    ),
    (
        "L3",
        "12 — Messaging & notifications",
        "Instagram DM inbox (Meta webhook)",
        "Verify + signature, inbox service.",
        "M",
        100000,
    ),
    (
        "L4",
        "12 — Messaging & notifications",
        "Transactional email (SendGrid/SES) + order/return templates",
        "Queued mail, retry, order/service-request/return templates.",
        "L",
        150000,
    ),
    (
        "L5",
        "12 — Messaging & notifications",
        "WhatsApp outreach templates (WATI/Exotel)",
        "Order/enquiry template sends.",
        "M",
        75000,
    ),
    # M Growth
    (
        "M1",
        "13 — SEO, ads & marketplaces",
        "On-page SEO: metadata, JSON-LD, sitemap, robots, production noindex gates",
        "Product/category/course/event/blog schema; Next sitemap.ts.",
        "L",
        150000,
    ),
    (
        "M2",
        "13 — SEO, ads & marketplaces",
        "Legacy WooCommerce URL compatibility (301s + middleware aliases)",
        "61+ permanent redirects, nested categories, /store→/product, slug aliases — Search Console preservation.",
        "L",
        175000,
    ),
    (
        "M3",
        "13 — SEO, ads & marketplaces",
        "Google Merchant Center native XML feeds + CTX / Ads compatibility",
        "Primary + CTX + sarveda-products feeds, identity backfill, 790/773/CTX certification packs.",
        "XL",
        275000,
    ),
    (
        "M4",
        "13 — SEO, ads & marketplaces",
        "Marketplaces: Amazon SP-API + Etsy + Flipkart (sync + admin ops)",
        "Channel models, sync jobs, listings/orders/returns workspace, CSV importers.",
        "XL",
        350000,
    ),
    (
        "M5",
        "13 — SEO, ads & marketplaces",
        "Attribution & shopper journey analytics",
        "Order source classifier, checkout visits, traffic retention.",
        "L",
        125000,
    ),
    # N Migration
    (
        "N1",
        "14 — WooCommerce → Sarveda data migration",
        "Catalog migration (products, variants, attributes, galleries, audio, accordion)",
        "CSV/WXR pipelines, 169+ products / 1000+ variants, SKU alignment workbooks.",
        "XL",
        300000,
    ),
    (
        "N2",
        "14 — WooCommerce → Sarveda data migration",
        "Media migration to S3 (~1,170 files) + CDN wiring",
        "migrate-media-to-s3, migration map, NEXT_PUBLIC_MEDIA_CDN_URL, DO backfill scripts.",
        "L",
        150000,
    ),
    (
        "N3",
        "14 — WooCommerce → Sarveda data migration",
        "Historical orders, refunds, users, coupons, reviews import",
        "WXR/CSV into legacy archives + live tables; old-orders admin.",
        "XL",
        250000,
    ),
    (
        "N4",
        "14 — WooCommerce → Sarveda data migration",
        "Live catalog compare program (DigitalOcean Woo vs Lightsail Postgres)",
        "Dump scripts, batch reports, fuzzy SKU, launch parity batches.",
        "XL",
        175000,
    ),
    (
        "N5",
        "14 — WooCommerce → Sarveda data migration",
        "Content/CMS migration (pages, corporate, testimonials, coupons WXR)",
        "CONTENT-MIGRATION runbook + import scripts.",
        "M",
        100000,
    ),
    # O AWS — professional setup (NOT Amazon monthly bills)
    (
        "O1",
        "15 — AWS / Lightsail configuration (professional services)",
        "Lightsail API server: Node, PM2, nginx reverse proxy, firewall, git deploy path",
        "Host ubuntu@13.204.112.165, sarveda-backend, run.sh, nginx rate limits, webhook buffering.",
        "L",
        125000,
    ),
    (
        "O2",
        "15 — AWS / Lightsail configuration (professional services)",
        "Lightsail managed PostgreSQL + Prisma migrate discipline",
        "DATABASE_URL, 125 migrations on deploy, password-rotation procedure.",
        "M",
        75000,
    ),
    (
        "O3",
        "15 — AWS / Lightsail configuration (professional services)",
        "Redis on instance (BullMQ jobs, checkout idempotency)",
        "localhost:6379, health check, payment-timeout + idempotency cache.",
        "S",
        50000,
    ),
    (
        "O4",
        "15 — AWS / Lightsail configuration (professional services)",
        "S3 bucket sarveda-media (us-east-1) + IAM + region wiring on Mumbai API",
        "AWS_S3_REGION=us-east-1, check:s3, complaints bucket, least-privilege keys.",
        "M",
        60000,
    ),
    (
        "O5",
        "15 — AWS / Lightsail configuration (professional services)",
        "EC2 + RDS (earlier staging) then cutover to Lightsail",
        "Original Mumbai EC2 13.206.192.106 + RDS; app+data moved to Lightsail stack.",
        "XL",
        150000,
    ),
    (
        "O6",
        "15 — AWS / Lightsail configuration (professional services)",
        "Frontend hosting, /api rewrite to Lightsail, CORS, custom domains",
        "Production FE on AWS/Lightsail preview + historical Vercel path; same-origin /api proxy.",
        "M",
        75000,
    ),
    (
        "O7",
        "15 — AWS / Lightsail configuration (professional services)",
        "TLS (certbot) + Cloudflare origin-pull + DNS cutover runbooks",
        "API SSL auto-renew, CF nginx snippets, apex/www cutover docs, maintenance page.",
        "M",
        100000,
    ),
    (
        "O8",
        "15 — AWS / Lightsail configuration (professional services)",
        "Production credential rotation + go-live checklist (12 groups)",
        "DB, JWT, AWS, payments, OAuth, email, SSH, CORS — documented and executed as ops.",
        "M",
        75000,
    ),
    (
        "O9",
        "15 — AWS / Lightsail configuration (professional services)",
        "Cutover war-room: 15h runbook, maintenance window, smoke tests",
        "CUTOVER_RUNBOOK_15H, evening DNS, Merchant timing, rollback criteria.",
        "L",
        100000,
    ),
    (
        "O10",
        "15 — AWS / Lightsail configuration (professional services)",
        "Accounting UAT on Lightsail (25+ validation scripts, live activation)",
        "phase*b-lightsail validation, opening batch, production posting flags.",
        "XL",
        125000,
    ),
    (
        "O11",
        "15 — AWS / Lightsail configuration (professional services)",
        "Co-located Next.js frontend preview on Lightsail (PM2 :3000/:8080)",
        "install-frontend-preview.sh, ecosystem.frontend.config.cjs — live storefront on AWS.",
        "M",
        50000,
    ),
    (
        "O12",
        "15 — AWS / Lightsail configuration (professional services)",
        "Monitoring, backups, health, optional Sentry",
        "/health DB+Redis, admin Servers dashboard, snapshot/backup SOP, compare-dump preserve on deploy.",
        "M",
        75000,
    ),
    (
        "O13",
        "15 — AWS / Lightsail configuration (professional services)",
        "DigitalOcean WordPress malware incident response (Jul 2026)",
        "Webshell/fake-plugin quarantine, clean index.php, Googlebot cloaking fix, credential rotation on DO. Separate from Node app but required to keep live shop safe during rebuild.",
        "M",
        75000,
    ),
    (
        "O14",
        "15 — AWS / Lightsail configuration (professional services)",
        "Third-party production wiring (webhooks, OAuth, Merchant feed URL, courier keys)",
        "Razorpay/Stripe/PayPal webhooks, Google OAuth callbacks, Shiprocket/Delhivery, SendGrid DNS.",
        "M",
        75000,
    ),
]

def quoted_amounts(market: list[int], target: int) -> list[int]:
    """Round each line to ₹1,000 and force the column to sum to target."""
    total = sum(market)
    raw = [int(round(a * target / total / 1000.0) * 1000) for a in market]
    raw[market.index(max(market))] += target - sum(raw)
    return raw


MARKET_AMOUNTS = [m[5] for m in MODULES]
QUOTED_AMOUNTS = quoted_amounts(MARKET_AMOUNTS, QUOTED_TOTAL)
assert sum(QUOTED_AMOUNTS) == QUOTED_TOTAL
assert len(QUOTED_AMOUNTS) == len(MODULES)

# Informational AWS monthly (paid to Amazon, NOT this invoice)
AWS_MONTHLY = [
    ("Lightsail instance (API + Redis + PM2, Mumbai)", "Amazon Lightsail", 4000, "Typical 2 vCPU / 4–8 GB class; confirm live plan in AWS console"),
    ("Lightsail managed PostgreSQL", "Amazon Lightsail Database", 7000, "Managed Postgres; snapshots extra if enabled"),
    ("S3 sarveda-media (us-east-1) storage + requests", "Amazon S3", 1500, "~1,170+ objects; grows with new product media"),
    ("S3 data transfer / CloudFront (if enabled)", "Amazon CloudFront / S3 egress", 2000, "Variable with traffic; CDN optional"),
    ("TLS / DNS (Lightsail/Vercel/Cloudflare)", "Registrar / Cloudflare / Amazon", 500, "Often bundled; domains already owned"),
    ("Email (SendGrid) — estimated", "SendGrid", 0, "Pass-through to SendGrid; not AWS; list for completeness"),
]


EXCLUSIONS = [
    ("GSTN filing (GSTR-1 / 3B API)", "Management GST reports exist. Statutory GSTN submit is not built.", "Future"),
    ("GSTR-2B import / auto-match", "ITC evidence is management-side only.", "Future"),
    ("TDS / 194C etc.", "Not in native books.", "Future"),
    ("RCM (reverse charge) journals", "System currently blocks RCM posts.", "Future"),
    ("Partial-refund GST auto-journals", "Ops refunds exist; GST journal not auto-safe.", "Future"),
    ("Cash flow statement", "TB / P&L / BS exist; cash flow does not.", "Future"),
    ("Manual journal entry UI", "Books post from events only.", "Future"),
    ("Period-close UI (month lock screen)", "Backend can block a closed period if seeded; no accountant UI.", "Future"),
    ("Chart of Accounts add/edit in UI", "CoA is seeded read-only.", "Future"),
    ("Historical Zoho year migration into Sarveda GL", "Zoho is archive; openings are a cutover job.", "Future"),
    ("Buyer GSTIN capture completeness on B2B checkout", "Partial — many sales B2C / GSTIN missing.", "Partial / future"),
    ("Warehouse-wise costing", "Single global SKU inventory.", "Future"),
    ("Standalone credit/debit notes beyond full-refund", "Full refund invert exists.", "Future"),
    ("COD as first-class accounting collection", "COD checkout path exists; books treatment incomplete.", "Future"),
    ("Full LMS video lesson player", "Courses + enrollments billed; player deferred.", "Not billed"),
    ("Customer wishlist UI", "Prisma model only.", "Not billed"),
    ("Dedicated Bluedart API module", "Shiprocket + Delhivery billed; Bluedart was planned only.", "Not billed"),
    ("Amazon Lightsail / S3 monthly invoices", "See sheet 04 — paid to AWS, not the developer.", "Pass-through"),
    ("Payment gateway MDR / courier invoices", "Razorpay/Stripe/Shiprocket vendor bills.", "Pass-through"),
]


def money(n: int) -> str:
    return f"₹{n:,}".replace(",", ",")  # Excel will format; this is for print


def apply_sheet_print(ws, landscape=True, fit_width=1):
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.fitToPage = True
    ws.page_setup.fitToWidth = fit_width
    ws.page_setup.fitToHeight = 0
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_margins = PageMargins(0.4, 0.4, 0.6, 0.5, 0.3, 0.3)
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = "1:4"
    ws.oddHeader.left.text = "Sarveda  ·  Development fee quote"
    ws.oddFooter.left.text = QUOTE_NO
    ws.oddFooter.right.text = "Page &P of &N"


def header_bar(ws, row, cols, title):
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=cols)
    c = ws.cell(row, 1, title)
    c.fill = fill_green
    c.font = font_h
    c.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[row].height = 22


def set_widths(ws, widths: dict[str, float]):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def style_amount(cell):
    cell.number_format = inr
    cell.font = font_body
    cell.alignment = right


def build():
    wb = Workbook()

    # =====================================================================
    # 01 Cover
    # =====================================================================
    cover = wb.active
    cover.title = "01 Cover"
    apply_sheet_print(cover, landscape=False)
    set_widths(cover, {"A": 3, "B": 28, "C": 55, "D": 22, "E": 22})

    cover.merge_cells("B2:E2")
    cover["B2"] = "SARVEDA"
    cover["B2"].font = Font(name="Calibri", size=14, bold=True, color=GOLD)

    cover.merge_cells("B3:E3")
    cover["B3"] = "Development fee quote — work already delivered"
    cover["B3"].font = font_title
    cover.row_dimensions[3].height = 28

    cover.merge_cells("B4:E4")
    cover["B4"] = (
        "Complete custom platform replacing WordPress/WooCommerce + Zoho Books live ledger. "
        "First bill. No payment received to date."
    )
    cover["B4"].font = font_muted
    cover["B4"].alignment = wrap
    cover.row_dimensions[4].height = 32

    meta = [
        ("Quote no.", QUOTE_NO),
        ("Date", QUOTE_DATE.strftime("%d %B %Y")),
        ("Client", "Sarveda (sarveda.com)"),
        ("Prepared for", "Accounts team — payment for development till date"),
        ("Period covered", PERIOD),
        ("Status", "DELIVERED — catch-up invoice (not an estimate for future work)"),
        ("Currency", "INR (Indian Rupees)"),
        ("SAC (GST)", "998314 — IT design and development services"),
    ]
    r = 6
    cover.cell(r, 2, "Quote details").font = font_h_dark
    cover.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    r = 7
    for i, (k, v) in enumerate(meta):
        rr = r + i
        cover.cell(rr, 2, k).font = font_muted
        cover.cell(rr, 3, v).font = font_bold
        cover.cell(rr, 2).fill = fill_cream
        cover.cell(rr, 3).fill = fill_cream

    cover.cell(16, 2, "How to read this workbook").font = font_h_dark
    cover.merge_cells("B17:E21")
    cover["B17"] = (
        "Sheet 02 is the one-page commercial summary for the meeting. "
        "Sheet 03 lists every module that exists in the product (do not drop a row — each is delivered). "
        "Sheet 04 splits AWS: (a) professional configuration fees billed here, vs (b) Amazon’s monthly bill which Accounts pays to AWS, not to development. "
        "Sheet 05 is the rate basis so a CA can defend the number. "
        "Sheet 06 is explicitly NOT billed — GSTN filing, TDS, manual journals, etc. — captured from the 20 Nov accounting meeting. "
        "Sheet 07 is payment terms. Totals on 02–04 use Excel formulas; if you negotiate a line on sheet 03, the GST figure updates."
    )
    cover["B17"].alignment = wrap
    cover["B17"].font = font_body
    cover.row_dimensions[17].height = 78

    cover.cell(23, 2, "Do not confuse with").font = font_h_dark
    notes = [
        "This is not AWS’s invoice. Lightsail/S3 monthly charges stay with Amazon (sheet 04, yellow block).",
        "This is not Razorpay/Stripe MDR, Shiprocket freight, or SendGrid credits.",
        "Native accounting is billed as delivered software (Zoho replacement). GSTN filing is not billed (sheet 06).",
        "Zoho integration is billed because it was built and used; it is retired as the live ledger, not deleted from the fee.",
    ]
    for i, t in enumerate(notes):
        cover.cell(24 + i, 2, "•").font = font_gold
        cover.merge_cells(start_row=24 + i, start_column=3, end_row=24 + i, end_column=5)
        cover.cell(24 + i, 3, t).font = font_body
        cover.cell(24 + i, 3).alignment = wrap
        cover.row_dimensions[24 + i].height = 20

    cover.cell(29, 2, "Prepared from the live codebase (Nov 2026): 45 backend modules, 125 Prisma migrations, 149+ storefront/admin routes, native GL, CRM, marketplaces, WhatsApp, Google Merchant, Woo→S3 migration, Lightsail production.").font = font_muted
    cover.merge_cells("B29:E30")
    cover["B29"].alignment = wrap

    cover.row_dimensions[1].height = 8
    for row in cover.iter_rows(min_row=1, max_row=32, min_col=1, max_col=5):
        for c in row:
            if c.value is None:
                c.fill = fill_white

    # =====================================================================
    # 03 Modules first (so summary can SUMIF)
    # =====================================================================
    mods = wb.create_sheet("03 Complete modules", 1)
    apply_sheet_print(mods, landscape=True)
    mods.freeze_panes = "A5"
    mods.auto_filter.ref = "A4:I120"
    set_widths(
        mods,
        {"A": 8, "B": 44, "C": 52, "D": 78, "E": 12, "F": 16, "G": 16, "H": 14, "I": 18},
    )

    header_bar(mods, 1, 9, "SARVEDA  ·  Complete delivered-module list  ·  do not omit rows")
    mods.merge_cells("A2:I2")
    mods["A2"] = (
        "Every row is in the running product as of 20 Nov 2026. Column F is THIS invoice (catch-up). "
        "Column G is full metro-agency replacement cost for the same work — not billed. "
        "Edit column F if Accounts negotiates; sheet 02 totals follow. Status = Delivered."
    )
    mods["A2"].font = font_muted
    mods["A2"].alignment = wrap
    mods.row_dimensions[2].height = 28
    mods.row_dimensions[3].height = 8

    headers = [
        "Code",
        "Workstream",
        "Module",
        "What was delivered",
        "Size",
        "Quoted fee (INR)",
        "Market replacement (INR)",
        "Status",
        "Hrs @ ₹2,500 (ref)",
    ]
    for col, h in enumerate(headers, 1):
        cell = mods.cell(4, col, h)
        cell.fill = fill_green
        cell.font = font_h
        cell.alignment = center
        cell.border = thin
    mods.row_dimensions[4].height = 22
    mods.auto_filter.ref = "A4:I120"

    data_start = 5
    for i, ((code, ws_name, module, delivered, size, market), quoted) in enumerate(
        zip(MODULES, QUOTED_AMOUNTS)
    ):
        row = data_start + i
        vals = [
            code,
            ws_name,
            module,
            delivered,
            size,
            quoted,
            market,
            "Delivered",
            f"=IF(F{row}=0,0,ROUND(F{row}/{HOURLY_REF},0))",
        ]
        for col, v in enumerate(vals, 1):
            cell = mods.cell(row, col, v)
            cell.border = thin
            cell.font = font_body
            cell.alignment = wrap if col in (2, 3, 4) else center
            if col in (2, 3, 4):
                cell.alignment = left
            if i % 2 == 1:
                cell.fill = fill_cream
            else:
                cell.fill = fill_white
        mods.cell(row, 5).alignment = center
        style_amount(mods.cell(row, 6))
        style_amount(mods.cell(row, 7))
        mods.cell(row, 7).font = font_muted
        mods.cell(row, 9).number_format = "#,##0"
        mods.cell(row, 9).alignment = center
        mods.row_dimensions[row].height = 36

    data_end = data_start + len(MODULES) - 1
    total_row = data_end + 1
    mods.merge_cells(start_row=total_row, start_column=1, end_row=total_row, end_column=5)
    mods.cell(total_row, 1, "TOTAL — billed column F is this invoice; column G is not billed")
    mods.cell(total_row, 1).alignment = Alignment(horizontal="right", vertical="center")
    for col in range(1, 10):
        mods.cell(total_row, col).fill = fill_total
        mods.cell(total_row, col).font = font_white_bold
        mods.cell(total_row, col).border = thin
    mods.cell(total_row, 6, f"=SUM(F{data_start}:F{data_end})")
    mods.cell(total_row, 6).number_format = inr
    mods.cell(total_row, 7, f"=SUM(G{data_start}:G{data_end})")
    mods.cell(total_row, 7).number_format = inr
    mods.cell(total_row, 9, f"=SUM(I{data_start}:I{data_end})")
    mods.cell(total_row, 9).number_format = "#,##0"
    mods.row_dimensions[total_row].height = 24

    gst_row = total_row + 1
    mods.merge_cells(start_row=gst_row, start_column=1, end_row=gst_row, end_column=5)
    mods.cell(gst_row, 1, "GST @ 18% on quoted fees (SAC 998314) — omit if billing entity is not GST-registered")
    mods.cell(gst_row, 1).alignment = Alignment(horizontal="right", vertical="center")
    for col in range(1, 10):
        mods.cell(gst_row, col).fill = fill_amber
        mods.cell(gst_row, col).border = thin
        mods.cell(gst_row, col).font = font_bold
    mods.cell(gst_row, 6, f"=F{total_row}*0.18")
    mods.cell(gst_row, 6).number_format = inr

    grand_row = gst_row + 1
    mods.merge_cells(start_row=grand_row, start_column=1, end_row=grand_row, end_column=5)
    mods.cell(grand_row, 1, "GRAND TOTAL PAYABLE (quoted + GST) — this is the amount to collect")
    mods.cell(grand_row, 1).alignment = Alignment(horizontal="right", vertical="center")
    for col in range(1, 10):
        mods.cell(grand_row, col).fill = fill_green
        mods.cell(grand_row, col).font = font_white_bold
        mods.cell(grand_row, col).border = thin
    mods.cell(grand_row, 6, f"=F{total_row}+F{gst_row}")
    mods.cell(grand_row, 6).number_format = inr
    mods.cell(grand_row, 6).fill = fill_green

    note_row = grand_row + 2
    mods.merge_cells(start_row=note_row, start_column=1, end_row=note_row, end_column=9)
    mods.cell(
        note_row,
        1,
        "Size: S = small surface, M = one vertical, L = multi-screen + API + jobs, XL = platform / compliance depth. "
        "Hours column is a CA reference only (quoted fee ÷ ₹2,500); this is not a timesheet. "
        "Market column is what a metro agency would typically charge for the same 94 delivered modules.",
    ).font = font_muted

    # Named range for summary
    mods_total_cell = f"'03 Complete modules'!F{total_row}"
    mods_gst_cell = f"'03 Complete modules'!F{gst_row}"
    mods_grand_cell = f"'03 Complete modules'!F{grand_row}"
    mods_hrs_cell = f"'03 Complete modules'!I{total_row}"
    data_start_ref = data_start
    data_end_ref = data_end

    # =====================================================================
    # 02 Summary
    # =====================================================================
    sm = wb.create_sheet("02 Summary", 1)
    apply_sheet_print(sm, landscape=False)
    sm.freeze_panes = "A8"
    set_widths(sm, {"A": 3, "B": 52, "C": 16, "D": 18, "E": 16, "F": 22})

    header_bar(sm, 1, 6, "SARVEDA  ·  One-page commercial summary")
    sm.merge_cells("B2:F2")
    sm["B2"] = (
        f"{QUOTE_NO}  ·  {QUOTE_DATE.strftime('%d %b %Y')}  ·  Period {PERIOD}  ·  "
        "Billed = Quoted fees. Market replacement on sheet 03 is for the CA only — not added to payable."
    )
    sm["B2"].font = font_muted
    sm["B2"].alignment = wrap
    sm.row_dimensions[2].height = 28

    sm["B4"] = "Quoted fees (ex-GST)"
    sm["B4"].font = font_muted
    sm["C4"] = f"={mods_total_cell}"
    sm["C4"].number_format = inr
    sm["C4"].font = Font(name="Calibri", size=16, bold=True, color=GREEN)

    sm["D4"] = "GST 18%"
    sm["D4"].font = font_muted
    sm["E4"] = f"={mods_gst_cell}"
    sm["E4"].number_format = inr
    sm["E4"].font = Font(name="Calibri", size=16, bold=True, color=GREEN)

    sm["B5"] = "TOTAL PAYABLE (incl. GST)"
    sm["B5"].font = font_white_bold
    sm["B5"].fill = fill_green
    sm["C5"] = f"={mods_grand_cell}"
    sm["C5"].number_format = inr
    sm["C5"].font = Font(name="Calibri", size=18, bold=True, color=WHITE)
    sm["C5"].fill = fill_green
    sm.merge_cells("C5:D5")
    sm["E5"] = f"={mods_hrs_cell}&\" ref. hours\""
    sm["E5"].font = font_muted
    sm.row_dimensions[5].height = 28
    for col in range(2, 6):
        if col != 5:
            sm.cell(5, col).fill = fill_green

    sm["B7"] = "Workstream"
    sm["C7"] = "Quoted fee (INR)"
    sm["D7"] = "% of quote"
    sm["E7"] = "Line items"
    for col in range(2, 6):
        sm.cell(7, col).fill = fill_green
        sm.cell(7, col).font = font_h
        sm.cell(7, col).alignment = center
        sm.cell(7, col).border = thin

    workstreams = []
    for rec in MODULES:
        if rec[1] not in workstreams:
            workstreams.append(rec[1])

    ws_start = 8
    for i, name in enumerate(workstreams):
        row = ws_start + i
        sm.cell(row, 2, name).font = font_body
        sm.cell(row, 2).border = thin
        sm.cell(row, 2).alignment = left
        sm.cell(row, 3, f"=SUMIF('03 Complete modules'!$B${data_start_ref}:$B${data_end_ref},B{row},'03 Complete modules'!$F${data_start_ref}:$F${data_end_ref})")
        sm.cell(row, 3).number_format = inr
        sm.cell(row, 3).border = thin
        sm.cell(row, 4, f"=IF('{QUOTE_NO}'=\"\",\"\",C{row}/{mods_total_cell})")
        # Fix percent formula - don't use quote no
        sm.cell(row, 4, f"=IF({mods_total_cell}=0,0,C{row}/{mods_total_cell})")
        sm.cell(row, 4).number_format = "0.0%"
        sm.cell(row, 4).border = thin
        sm.cell(row, 5, f"=COUNTIF('03 Complete modules'!$B${data_start_ref}:$B${data_end_ref},B{row})")
        sm.cell(row, 5).border = thin
        sm.cell(row, 5).alignment = center
        if i % 2:
            for col in range(2, 6):
                sm.cell(row, col).fill = fill_cream
        sm.row_dimensions[row].height = 18

    ws_end = ws_start + len(workstreams) - 1
    tot = ws_end + 1
    sm.cell(tot, 2, "TOTAL (must match sheet 03)").font = font_white_bold
    sm.cell(tot, 2).fill = fill_total
    sm.cell(tot, 3, f"=SUM(C{ws_start}:C{ws_end})")
    sm.cell(tot, 3).number_format = inr
    sm.cell(tot, 3).font = font_white_bold
    sm.cell(tot, 3).fill = fill_total
    sm.cell(tot, 4, "100%")
    sm.cell(tot, 4).font = font_white_bold
    sm.cell(tot, 4).fill = fill_total
    sm.cell(tot, 4).alignment = center
    sm.cell(tot, 5, f"=SUM(E{ws_start}:E{ws_end})")
    sm.cell(tot, 5).font = font_white_bold
    sm.cell(tot, 5).fill = fill_total
    sm.cell(tot, 5).alignment = center
    sm.cell(tot, 2).border = thin
    sm.cell(tot, 3).border = thin
    sm.cell(tot, 4).border = thin
    sm.cell(tot, 5).border = thin

    # Chart data is the workstream table
    chart = BarChart()
    chart.type = "bar"
    chart.grouping = "clustered"
    chart.title = "Professional fees by workstream (INR, ex-GST)"
    chart.y_axis.title = None
    chart.x_axis.title = None
    chart.style = 10
    chart.y_axis.numFmt = "₹#,##,##0"
    data = Reference(sm, min_col=3, min_row=7, max_row=ws_end)
    cats = Reference(sm, min_col=2, min_row=ws_start, max_row=ws_end)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    chart.shape = 4
    chart.legend = None
    chart.height = 10
    chart.width = 18
    sm.add_chart(chart, "B" + str(tot + 3))

    foot = tot + 22
    sm.merge_cells(start_row=foot, start_column=2, end_row=foot, end_column=6)
    sm.cell(
        foot,
        2,
        "Billed total is the Quoted column (₹85 lakh + GST). Market replacement on sheet 03 (~₹1.62 crore) is what a metro agency "
        "would typically charge for the same 94 delivered modules — shown so Accounts can see the work was not under-scoped. "
        "SaaS rent (Shopify Plus + Zoho Books/CRM + feed apps) would still miss India GST, Delhivery, RTO and this PDP. "
        "Record shop day ₹3,07,975 — this is production IP, not a brochure site.",
    ).font = font_muted
    sm.cell(foot, 2).alignment = wrap
    sm.row_dimensions[foot].height = 48

    # =====================================================================
    # 04 AWS
    # =====================================================================
    aws = wb.create_sheet("04 AWS and infra")
    apply_sheet_print(aws, landscape=True)
    set_widths(aws, {"A": 8, "B": 62, "C": 22, "D": 16, "E": 55})
    header_bar(aws, 1, 5, "AWS / Lightsail — configuration fees vs Amazon monthly bills")
    aws.merge_cells("A2:E2")
    aws["A2"] = (
        "Yellow block = money Accounts already pays (or will pay) to Amazon / Cloudflare. "
        "Green block = professional setup billed in THIS quote (also included in sheet 03 workstream 15). Do not pay Amazon’s monthly twice."
    )
    aws["A2"].font = font_muted
    aws["A2"].alignment = wrap
    aws.row_dimensions[2].height = 28

    aws.merge_cells("A4:E4")
    aws["A4"] = "A. Professional configuration (BILLED in this quote — subset of sheet 03, workstream 15)"
    aws["A4"].fill = fill_green
    aws["A4"].font = font_h

    for col, h in enumerate(["Code", "Configuration item", "Where", "Fee (INR)", "Notes"], 1):
        c = aws.cell(5, col, h)
        c.fill = fill_mid
        c.font = font_h
        c.border = thin
        c.alignment = center

    aws_codes = [m for m in MODULES if m[0].startswith("O")]
    ar = 6
    for i, (code, _ws, module, delivered, _sz, amount) in enumerate(aws_codes):
        aws.cell(ar, 1, code).border = thin
        aws.cell(ar, 2, module).border = thin
        aws.cell(ar, 2).alignment = wrap
        aws.cell(ar, 3, "Lightsail / AWS / DNS").border = thin
        aws.cell(ar, 4, f"=SUMIF('03 Complete modules'!$A${data_start_ref}:$A${data_end_ref},A{ar},'03 Complete modules'!$F${data_start_ref}:$F${data_end_ref})")
        aws.cell(ar, 4).number_format = inr
        aws.cell(ar, 4).border = thin
        aws.cell(ar, 5, delivered).border = thin
        aws.cell(ar, 5).alignment = wrap
        aws.row_dimensions[ar].height = 32
        if i % 2:
            for col in range(1, 6):
                aws.cell(ar, col).fill = fill_cream
        ar += 1
    aws_end = ar - 1
    aws.cell(ar, 2, "Subtotal — AWS/infra professional services (already inside grand total)").font = font_white_bold
    aws.cell(ar, 2).fill = fill_total
    aws.cell(ar, 4, f"=SUM(D6:D{aws_end})")
    aws.cell(ar, 4).number_format = inr
    aws.cell(ar, 4).font = font_white_bold
    for col in range(1, 6):
        aws.cell(ar, col).fill = fill_total
        aws.cell(ar, col).font = font_white_bold
        aws.cell(ar, col).border = thin
    aws_sub_row = ar

    ar += 2
    aws.merge_cells(start_row=ar, start_column=1, end_row=ar, end_column=5)
    aws.cell(ar, 1, "B. Estimated monthly run-rate paid to Amazon / vendors — NOT part of this development invoice")
    aws.cell(ar, 1).fill = fill_gold
    aws.cell(ar, 1).font = Font(name="Calibri", size=12, bold=True, color=WHITE)
    ar += 1
    for col, h in enumerate(["#", "Service", "Vendor", "Est. ₹ / month", "Notes"], 1):
        c = aws.cell(ar, col, h)
        c.fill = PatternFill("solid", fgColor="9C6644")
        c.font = font_h
        c.border = thin
        c.alignment = center
    hdr = ar
    ar += 1
    mstart = ar
    for i, (svc, vendor, amt, note) in enumerate(AWS_MONTHLY, 1):
        aws.cell(ar, 1, i).border = thin
        aws.cell(ar, 1).alignment = center
        aws.cell(ar, 2, svc).border = thin
        aws.cell(ar, 3, vendor).border = thin
        aws.cell(ar, 4, amt).border = thin
        aws.cell(ar, 4).number_format = inr
        aws.cell(ar, 5, note).border = thin
        aws.cell(ar, 5).alignment = wrap
        for col in range(1, 6):
            aws.cell(ar, col).fill = fill_amber
        aws.row_dimensions[ar].height = 22
        ar += 1
    mend = ar - 1
    aws.cell(ar, 2, "Estimated AWS+hosting monthly (confirm on live AWS bill)").font = font_bold
    aws.cell(ar, 2).fill = fill_amber
    aws.cell(ar, 4, f"=SUM(D{mstart}:D{mend})")
    aws.cell(ar, 4).number_format = inr
    aws.cell(ar, 4).font = font_bold
    for col in range(1, 6):
        aws.cell(ar, col).fill = fill_amber
        aws.cell(ar, col).border = thin
    monthly_row = ar

    ar += 2
    aws.merge_cells(start_row=ar, start_column=1, end_row=ar + 3, end_column=5)
    aws.cell(
        ar,
        1,
        "Live architecture billed for setup: customer → storefront (Next.js on AWS Lightsail preview / historically Vercel) "
        "→ /api reverse-proxy → Lightsail nginx → Express PM2 (sarveda-backend) → Lightsail Postgres + Redis on instance → S3 sarveda-media (us-east-1). "
        "Earlier staging on EC2 13.206.192.106 + RDS Mumbai is included as migration work. "
        "DigitalOcean WordPress (134.209.146.175) was the old shop and malware-incident host — cleanup billed; DO monthly is not.",
    )
    aws.cell(ar, 1).alignment = wrap
    aws.cell(ar, 1).font = font_body

    ar += 5
    aws.merge_cells(start_row=ar, start_column=1, end_row=ar, end_column=5)
    aws.cell(
        ar,
        1,
        f"Tip: if Accounts wants a single number for “AWS work”, use D{aws_sub_row} (setup fee, already in the grand total). "
        f"For next month’s cash forecast, use D{monthly_row} plus actual AWS invoice variance.",
    ).font = font_muted

    # =====================================================================
    # 05 Rate basis
    # =====================================================================
    rb = wb.create_sheet("05 Rate basis")
    apply_sheet_print(rb, landscape=False)
    set_widths(rb, {"A": 3, "B": 42, "C": 62, "D": 22})
    header_bar(rb, 1, 4, "Rate basis — how this number was set (for the CA)")

    rb.merge_cells("B3:D3")
    rb["B3"] = "This is a value-based professional fee for delivered IP, not a salary timesheet and not a SaaS subscription."
    rb["B3"].font = font_bold

    rows = [
        ("Method", "Indian custom-software replacement cost for a live, multi-currency, GST-inclusive shop that also needed native books (Zoho retired)."),
        ("Period actually worked", PERIOD + " (platform from first commit through native accounting + AWS frontend)."),
        ("Reference rate (transparency)", f"₹{HOURLY_REF:,} / hour blended. Hours on sheet 03 = fee ÷ rate. Do not treat as clocked time."),
        ("What a metro agency would typically quote", "Same 94 modules (commerce + 3 gateways + 2 couriers + returns/RTO + native GL/GST/banking + CRM + 3 marketplaces + Merchant + Woo migration + AWS): about ₹1.5–1.8 crore + GST. Sheet 03 column G totals that replacement cost."),
        ("What this invoice asks", "₹85,00,000 + GST. Single-vendor catch-up for work already live. Itemised, git-backed, no padding for GSTN/TDS/manual journals (sheet 06)."),
        ("Why native accounting is a large share", "It replaced Zoho Books as the live ledger (event-sourced GL, GST management, FIFO, banking recon). That is ERP-class work, not a Woo plugin."),
        ("Why AWS is billed", "Provisioning, nginx/PM2/SSL, Postgres, S3 region split (us-east-1 media vs ap-south-1 API), EC2→Lightsail move, cutover night, accounting UAT on the server — professional services. Monthly Lightsail is Amazon’s bill."),
        ("Why Zoho integration is billed", "Built, synced, historically used; then retired. The hours and IP were delivered. Native books are the authority going forward."),
        ("SaaS rent avoided (context)", "Shopify Plus + Zoho Books/Inventory/CRM + feed apps is recurring USD/INR every year and still would not cover India GST, Delhivery, RTO, or this PDP. This quote buys owned IP."),
        ("Record business context", "Client shop has taken ₹3,07,975 on a single recorded day — this is production software, not a brochure site."),
        ("What was NOT used", "No padding for wishlist UI, Bluedart API, or full LMS player (called out on sheet 06 as not billed)."),
    ]
    r = 5
    rb.cell(r, 2, "Topic").fill = fill_green
    rb.cell(r, 2).font = font_h
    rb.cell(r, 3, "Position").fill = fill_green
    rb.cell(r, 3).font = font_h
    rb.merge_cells("C5:D5")
    for topic, pos in rows:
        r += 1
        rb.cell(r, 2, topic).font = font_bold
        rb.cell(r, 2).alignment = wrap
        rb.cell(r, 2).fill = fill_cream
        rb.cell(r, 2).border = thin
        rb.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4)
        rb.cell(r, 3, pos).font = font_body
        rb.cell(r, 3).alignment = wrap
        rb.cell(r, 3).border = thin
        rb.cell(r, 4).border = thin
        rb.row_dimensions[r].height = 36

    r += 2
    rb.cell(r, 2, "Suggested talking line in the payment meeting").font = font_h_dark
    r += 1
    rb.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
    rb.cell(
        r,
        2,
        "“We have not taken a rupee so far. This invoice is the catch-up for the live store, the native books you just reviewed, "
        "AWS/Lightsail production, and every ops module in Admin. GSTN filing and TDS are listed separately — they are not in this bill.”",
    )
    rb.cell(r, 2).alignment = wrap
    rb.cell(r, 2).font = Font(name="Calibri", size=11, italic=True, color=GREEN)
    rb.row_dimensions[r].height = 48

    # =====================================================================
    # 06 Exclusions
    # =====================================================================
    ex = wb.create_sheet("06 Not in this bill")
    apply_sheet_print(ex, landscape=True)
    set_widths(ex, {"A": 8, "B": 48, "C": 70, "D": 18})
    header_bar(ex, 1, 4, "Not billed today — log from the 20 Nov 2026 accounting meeting + known product gaps")
    ex.merge_cells("A2:D2")
    ex["A2"] = (
        "These are real needs or deferred items. They are listed so Accounts does not think they are “missing from the invoice by mistake”. "
        "If the team still wants them, they become a later SOW — see docs/ACCOUNTING-TEAM-MEETING-2026-11-20.md."
    )
    ex["A2"].font = font_muted
    ex["A2"].alignment = wrap
    ex.row_dimensions[2].height = 32

    for col, h in enumerate(["#", "Item", "Why it is out of this invoice", "Bucket"], 1):
        c = ex.cell(4, col, h)
        c.fill = fill_green
        c.font = font_h
        c.border = thin
        c.alignment = center

    for i, (item, why, bucket) in enumerate(EXCLUSIONS, 1):
        row = 4 + i
        ex.cell(row, 1, i).border = thin
        ex.cell(row, 1).alignment = center
        ex.cell(row, 2, item).border = thin
        ex.cell(row, 2).alignment = wrap
        ex.cell(row, 3, why).border = thin
        ex.cell(row, 3).alignment = wrap
        ex.cell(row, 4, bucket).border = thin
        ex.cell(row, 4).alignment = center
        fill = fill_amber if bucket == "Future" else (fill_cream if bucket.startswith("Partial") else fill_white)
        if bucket == "Pass-through":
            fill = PatternFill("solid", fgColor="EDE4D3")
        if bucket == "Not billed":
            fill = fill_cat
        for col in range(1, 5):
            ex.cell(row, col).fill = fill
            ex.cell(row, col).font = font_body
        ex.row_dimensions[row].height = 28

    last = 4 + len(EXCLUSIONS)
    ex.merge_cells(start_row=last + 2, start_column=1, end_row=last + 2, end_column=4)
    ex.cell(
        last + 2,
        1,
        "After Accounts marks K1–K16 on the meeting pack, copy Blocker/High items into a new quote. Do not reopen this catch-up invoice for those.",
    ).font = font_muted

    # =====================================================================
    # 07 Payment terms
    # =====================================================================
    pt = wb.create_sheet("07 Payment terms")
    apply_sheet_print(pt, landscape=False)
    set_widths(pt, {"A": 3, "B": 32, "C": 55, "D": 22})
    header_bar(pt, 1, 4, "Payment terms — catch-up for delivered work")

    terms = [
        ("Invoice type", "Catch-up professional fees for work already delivered and in production use."),
        ("Amount due", "Sheet 02 “TOTAL PAYABLE (incl. GST)” unless the billing entity is unregistered, in which case pay the ex-GST total."),
        ("Payment already received", "₹0 (nil). This is the first bill."),
        ("Due date", "Immediately on presentation; or 50% this week and 50% within 15 calendar days."),
        ("Validity of this quote", "15 days from quote date if any line is negotiated; after that regenerate from git."),
        ("Bank / UPI", "To be filled by the billing entity (name, account, IFSC, UPI, GSTIN). Do not commit secrets to git."),
        ("GST", "18% extra if the billing entity is GST-registered (SAC 998314). Reverse charge does not apply to this software service as billed here."),
        ("TDS (194J / 194C)", "If Sarveda deducts TDS on professional fees, deduct as per law and deposit; net payable to developer = grand total − TDS. This is Accounts’ statutory duty, not a discount."),
        ("Change requests", "GSTN, TDS module, manual journals, cash flow, CoA CRUD = new SOW (sheet 06)."),
        ("IP / source", "Code is in the Sarveda GitHub repository; this fee is for design, build, migration, AWS configuration, and go-live through 20 Nov 2026."),
        ("Warranty", "Defects in billed modules: reasonable fix window 30 days from payment. New features are extra."),
        ("AWS monthly", "Continues on Sarveda’s AWS account. Not withheld from this invoice."),
    ]
    pt.cell(3, 2, "Term").fill = fill_green
    pt.cell(3, 2).font = font_h
    pt.cell(3, 3, "Detail").fill = fill_green
    pt.cell(3, 3).font = font_h
    pt.merge_cells("C3:D3")
    r = 4
    for k, v in terms:
        pt.cell(r, 2, k).font = font_bold
        pt.cell(r, 2).fill = fill_cream
        pt.cell(r, 2).border = thin
        pt.cell(r, 2).alignment = wrap
        pt.merge_cells(start_row=r, start_column=3, end_row=r, end_column=4)
        pt.cell(r, 3, v).font = font_body
        pt.cell(r, 3).alignment = wrap
        pt.cell(r, 3).border = thin
        pt.cell(r, 4).border = thin
        pt.row_dimensions[r].height = 32
        r += 1

    r += 1
    pt.cell(r, 2, "Sign-off").font = font_h_dark
    r += 1
    for label in (
        "For Sarveda accounts — name / date / accepted payable (incl. or excl. GST)",
        "For development — name / date / GSTIN / bank details attached separately",
    ):
        pt.merge_cells(start_row=r, start_column=2, end_row=r + 2, end_column=4)
        pt.cell(r, 2, label)
        pt.cell(r, 2).alignment = Alignment(vertical="top", wrap_text=True)
        pt.cell(r, 2).border = thin
        pt.cell(r, 2).font = font_muted
        for col in range(2, 5):
            pt.cell(r, col).border = thin
            pt.cell(r + 1, col).border = thin
            pt.cell(r + 2, col).border = thin
        pt.row_dimensions[r].height = 20
        pt.row_dimensions[r + 1].height = 20
        pt.row_dimensions[r + 2].height = 20
        r += 4

    # Cover KPIs pointing at formulas
    cover["B12"] = "Payable incl. GST"
    cover["C12"] = f"={mods_grand_cell}"
    cover["C12"].number_format = inr
    cover["C12"].font = Font(name="Calibri", size=14, bold=True, color=GREEN)
    # Wait - I already used rows 6-14 for meta. Let me put KPIs in D/E of the meta block instead.
    # Actually I overwrote conceptually - looking at cover layout:
    # rows 6 title, 7-14 meta. I'll put the three KPIs at D7:E14

    cover["D7"] = "Fees ex-GST"
    cover["D7"].font = font_muted
    cover["E7"] = f"={mods_total_cell}"
    cover["E7"].number_format = inr
    cover["E7"].font = Font(name="Calibri", size=14, bold=True, color=GREEN)
    cover["D8"] = "GST 18%"
    cover["D8"].font = font_muted
    cover["E8"] = f"={mods_gst_cell}"
    cover["E8"].number_format = inr
    cover["E8"].font = font_bold
    cover["D9"] = "PAYABLE"
    cover["D9"].font = font_white_bold
    cover["D9"].fill = fill_green
    cover["E9"] = f"={mods_grand_cell}"
    cover["E9"].number_format = inr
    cover["E9"].font = Font(name="Calibri", size=16, bold=True, color=WHITE)
    cover["E9"].fill = fill_green
    cover["D10"] = "Modules billed"
    cover["D10"].font = font_muted
    cover["E10"] = len(MODULES)
    cover["E10"].font = font_bold
    cover["D11"] = "Prior payments"
    cover["D11"].font = font_muted
    cover["E11"] = 0
    cover["E11"].number_format = inr
    cover["E11"].font = font_bold
    cover["D12"] = "Market replacement (not billed)"
    cover["D12"].font = font_muted
    cover["E12"] = f"='03 Complete modules'!G{total_row}"
    cover["E12"].number_format = inr
    cover["E12"].font = font_muted

    # Remove the accidental B12 if I set it - I did set cover B12 which collides with meta
    # Meta uses B7:C14. B12 is "Status" key. I must NOT overwrite B12.
    # I set cover["B12"] = "Payable incl. GST" which DESTROYS the Status label.
    # Fix: clear B12 back to Status
    cover["B12"] = "Status"
    cover["B12"].font = font_muted
    cover["B12"].fill = fill_cream
    # C12 was overwritten with formula - restore Status value and keep KPIs only in D/E
    cover["C12"] = "DELIVERED — catch-up invoice (not an estimate for future work)"
    cover["C12"].font = font_bold
    cover["C12"].number_format = "General"
    cover["C12"].fill = fill_cream

    # Freeze + print
    cover.freeze_panes = "B6"
    cover.print_area = "A1:E32"

    # Sheet order: Cover, Summary, Modules, AWS, Rate, Exclusions, Terms
    # Currently: Cover, Modules (pos1 then Summary inserted at 1), wait
    # I created: cover (active), mods at 1, then sm at 1 — so order is Cover, Summary, Modules, AWS...
    # Let's verify: 
    # wb.active = Cover
    # create_sheet Modules, 1  -> Cover, Modules
    # create_sheet Summary, 1 -> Cover, Summary, Modules
    # then AWS, Rate, Exclusions, Terms append
    # Good.

    wb.calculation.calcMode = "auto"
    wb.calculation.fullCalcOnLoad = True

    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    fees = sum(QUOTED_AMOUNTS)
    market = sum(MARKET_AMOUNTS)
    gst = round(fees * GST_RATE)
    print(f"Wrote {OUT}")
    print(f"Modules: {len(MODULES)}")
    print(f"Quoted ex-GST: {fees}")
    print(f"Market replacement: {market}")
    print(f"GST 18% on quoted: {gst}")
    print(f"Payable: {fees + gst}")
    print(f"Ref hours on quoted: {round(fees / HOURLY_REF)}")
    s = defaultdict(int)
    sq = defaultdict(int)
    for m, q in zip(MODULES, QUOTED_AMOUNTS):
        s[m[1]] += m[5]
        sq[m[1]] += q
    for k in sq:
        print(f"  {k}: quoted {sq[k]}  market {s[k]}")


if __name__ == "__main__":
    build()
