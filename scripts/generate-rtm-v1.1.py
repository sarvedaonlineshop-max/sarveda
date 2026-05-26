#!/usr/bin/env python3
"""
Generate Sarveda-RTM-v1.1-audited.xlsx — code audit 19 May 2026.
Same column layout as original RTM; statuses aligned to repo + MIGRATION_STATUS.md.
"""
from __future__ import annotations

import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "Sarveda-RTM-v1.1-audited.xlsx"

# (dev, test, audit_note_append)
AUDIT: dict[str, tuple[str, str, str]] = {
    "REQ-AUTH-003": ("Not Started", "Not Tested", "Audit: no forgot-password API in repo."),
    "REQ-PROD-002": ("Complete", "Not Tested", "Audit: multi-image needs sync:galleries on EC2/RDS."),
    "REQ-PROD-003": ("In Progress", "Not Tested", "Audit: run import:variations for Type/Size labels."),
    "REQ-PROD-009": ("Complete", "Not Tested", "Audit: RelatedProducts + PairWith on PDP."),
    "REQ-PROD-011": ("In Progress", "Not Tested", "Audit: removed from PDP; pincode at checkout/shipping API only."),
    "REQ-PROD-012": ("Complete", "Not Tested", "Audit: EstimatedDelivery in ProductBuyBox."),
    "REQ-CART-003": ("Complete", "Pass", "Audit: reserve at checkout create-order (not on cart add)."),
    "REQ-CART-007": ("Complete", "Not Tested", "Audit: optionalAuth — guest email checkout supported."),
    "REQ-CART-009": ("Complete", "Not Tested", "Audit: computeVariantShippingTotal in checkout.service."),
    "REQ-PAY-004": ("Complete", "Not Tested", "Audit: COD checkout + PaymentSelector implemented."),
    "REQ-PAY-009": ("In Progress", "Not Tested", "Audit: zone INR/USD/GBP pricing; no manual switcher."),
    "REQ-ORD-003": ("Complete", "Not Tested", "Audit: /profile + YourOrders."),
    "REQ-ORD-004": ("Complete", "Not Tested", "Audit: order detail via orders API + profile."),
    "REQ-ORD-005": ("In Progress", "Not Tested", "Audit: invoice PDF service; needs paid-order + SendGrid test."),
    "REQ-ORD-010": ("Complete", "Not Tested", "Audit: /track/[awb] page exists."),
    "REQ-SHIP-001": ("In Progress", "Not Tested", "Audit: delhivery module; E2E not verified on staging."),
    "REQ-SHIP-002": ("In Progress", "Not Tested", "Audit: shiprocket module; E2E not verified."),
    "REQ-SHIP-003": ("In Progress", "Not Tested", "Audit: router.ts exists; courier E2E pending."),
    "REQ-SHIP-005": ("In Progress", "Not Tested", "Audit: checkout pincode check; not on PDP."),
    "REQ-SHIP-006": ("Complete", "Not Tested", "Audit: VariantShippingRate in checkout."),
    "REQ-SHIP-007": ("Complete", "Not Tested", "Audit: international rates in DB + checkout."),
    "REQ-NOT-001": ("In Progress", "Not Tested", "Audit: sendOrderEmail on paid; needs SENDGRID on EC2."),
    "REQ-NOT-002": ("In Progress", "Not Tested", "Audit: payment_failed email wired."),
    "REQ-NOT-003": ("In Progress", "Not Tested", "Audit: order_shipped email wired."),
    "REQ-NOT-004": ("In Progress", "Not Tested", "Audit: order_delivered email wired."),
    "REQ-NOT-005": ("In Progress", "Not Tested", "Audit: invoice link in confirmation email."),
    "REQ-NOT-010": ("In Progress", "Not Tested", "Audit: ensureOrderInvoicePdf on PAID."),
    "REQ-NOT-011": ("In Progress", "Not Tested", "Audit: sync email send; BullMQ email queue not yet."),
    "REQ-ZOHO-001": ("Not Started", "Not Tested", "Audit: no Zoho code in repo — document if external integration."),
    "REQ-CRS-001": ("Complete", "Not Tested", "Audit: /courses listing page live in codebase."),
    "REQ-MKT-005": ("In Progress", "Not Tested", "Audit: generateMetadata + sitemap.xml; 22 WP sitemaps deferred."),
}

ROWS: list[dict] = [
    {"id": "REQ-AUTH-001", "module": "Authentication", "desc": "Customer can register with email and password", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "auth routes / signup", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-AUTH-002", "module": "Authentication", "desc": "Customer can login with Google OAuth", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "Google OAuth sarveda-demo.xyz", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-AUTH-003", "module": "Authentication", "desc": "Customer can reset password via email", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "In Progress", "test": "Not Tested", "evidence": "", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-AUTH-004", "module": "Authentication", "desc": "JWT token issued on login, expires in 7 days", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "auth middleware", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-AUTH-005", "module": "Authentication", "desc": "Admin panel protected — only admin roles can access", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "AdminAuthBoundary", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-AUTH-006", "module": "Authentication", "desc": "Multiple admin roles: Super Admin, Order Manager, Inventory, Marketing, Finance", "source": "Arjun", "priority": "Must Have", "design": "In Progress", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": "Schema: CUSTOMER / ADMIN / SUPER_ADMIN only"},
    {"id": "REQ-AUTH-007", "module": "Authentication", "desc": "Session auto-logout after inactivity", "source": "Technical", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-PROD-001", "module": "Products", "desc": "169 products migrated from WooCommerce", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "CSV/RDS import", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PROD-002", "module": "Products", "desc": "Products have multiple images", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "ProductGallery", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PROD-003", "module": "Products", "desc": "Products have variants (size, weight, note/tone)", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "VariantSelector", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PROD-004", "module": "Products", "desc": "Audio samples on singing bowl products", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "hasAudio + S3 CDN", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PROD-005", "module": "Products", "desc": "Product categories with hierarchical structure", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "CategoryTree API", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PROD-006", "module": "Products", "desc": "Stock level shown on product page", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "stockDisplay()", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PROD-007", "module": "Products", "desc": "Low stock badge when stock ≤ 5 units", "source": "Arjun", "priority": "Should Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "productListBadges()", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PROD-008", "module": "Products", "desc": "Out of stock badge — disable add to cart", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PROD-009", "module": "Products", "desc": "Related products section on product page", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-PROD-010", "module": "Products", "desc": "Customer reviews and star ratings on product page", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": "Placeholder UI only"},
    {"id": "REQ-PROD-011", "module": "Products", "desc": "Pincode serviceability check before add to cart", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "check-pincode API", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-PROD-012", "module": "Products", "desc": "Estimated delivery date shown on product page", "source": "Arjun", "priority": "Must Have", "design": "In Progress", "dev": "In Progress", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-PROD-013", "module": "Products", "desc": "Product search with filters (category, price, weight)", "source": "Arjun", "priority": "Must Have", "design": "In Progress", "dev": "In Progress", "test": "Not Tested", "evidence": "/search", "sprint": "Sprint 2", "notes": "Search page exists; advanced filters partial"},
    {"id": "REQ-PROD-014", "module": "Products", "desc": "GST/HSN codes on products for invoicing", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-PROD-015", "module": "Products", "desc": "Artisan/source story on product page", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-PROD-016", "module": "Products", "desc": "Product video embed support", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-PROD-017", "module": "Products", "desc": "Wishlist / Save for later", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-PROD-018", "module": "Products", "desc": "Bulk product import/export via CSV", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-CART-001", "module": "Cart & Checkout", "desc": "Add to cart with variant selection", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-CART-002", "module": "Cart & Checkout", "desc": "Cart persists across sessions (logged in user)", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-CART-003", "module": "Cart & Checkout", "desc": "Stock reserved at checkout — released if not paid in 15 min", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "BullMQ payment timeout", "sprint": "Sprint 1", "notes": "Corrected wording from add-to-cart"},
    {"id": "REQ-CART-004", "module": "Cart & Checkout", "desc": "Cart drawer slides in from right (mobile + desktop)", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "CartDrawer", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-CART-005", "module": "Cart & Checkout", "desc": "Free shipping threshold indicator in cart", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-CART-006", "module": "Cart & Checkout", "desc": "Coupon code application at checkout", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": "Coupons imported to DB; no checkout UI"},
    {"id": "REQ-CART-007", "module": "Cart & Checkout", "desc": "Guest checkout (without account)", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-CART-008", "module": "Cart & Checkout", "desc": "Address form with pincode auto-fill (city/state)", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "AddressFields", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-CART-009", "module": "Cart & Checkout", "desc": "Shipping cost calculated from VariantShippingRate table", "source": "Arjun", "priority": "Must Have", "design": "In Progress", "dev": "In Progress", "test": "Not Tested", "evidence": "checkout.service", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-CART-010", "module": "Cart & Checkout", "desc": "Order summary with GST breakdown at checkout", "source": "Arjun", "priority": "Must Have", "design": "In Progress", "dev": "In Progress", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": "Tax fields exist; full GST line breakdown TBD"},
    {"id": "REQ-CART-011", "module": "Cart & Checkout", "desc": "Abandoned cart recovery — WhatsApp/Email reminder", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": "payment_reminder email job partial"},
    {"id": "REQ-PAY-001", "module": "Payments", "desc": "Razorpay integration — India payments (UPI, cards, netbanking)", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "webhook + verify", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PAY-002", "module": "Payments", "desc": "Stripe integration — international payments", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "In Progress", "test": "Not Tested", "evidence": "stripe.ts", "sprint": "Sprint 2", "notes": "Backend + frontend; staging E2E pending"},
    {"id": "REQ-PAY-003", "module": "Payments", "desc": "PayPal integration — international payments", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "In Progress", "test": "Not Tested", "evidence": "paypal.ts", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-PAY-004", "module": "Payments", "desc": "COD (Cash on Delivery) — India only", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-PAY-005", "module": "Payments", "desc": "Payment webhook verification (signature check)", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "HMAC webhooks", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PAY-006", "module": "Payments", "desc": "Payment failure page with retry option", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "/payment-failed", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PAY-007", "module": "Payments", "desc": "Idempotency keys — prevent double charging", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "Redis + header", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-PAY-008", "module": "Payments", "desc": "Refund processing via payment gateway", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-PAY-009", "module": "Payments", "desc": "Multi-currency support — INR, USD, GBP", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-PAY-010", "module": "Payments", "desc": "Currency switcher on frontend", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-PAY-011", "module": "Payments", "desc": "EMI options via Razorpay", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-ORD-001", "module": "Orders", "desc": "Order confirmation page after payment", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "order/confirmed", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ORD-002", "module": "Orders", "desc": "Order status lifecycle: Pending → Paid → Processing → Shipped → Delivered", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "OrderStatus enum", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ORD-003", "module": "Orders", "desc": "Customer can view all past orders in My Account", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "In Progress", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-ORD-004", "module": "Orders", "desc": "Customer can view single order detail", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "In Progress", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-ORD-005", "module": "Orders", "desc": "Customer can download GST invoice from order page", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ORD-006", "module": "Orders", "desc": "Admin can view and filter all orders", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "Admin orders", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ORD-007", "module": "Orders", "desc": "Admin can update order status manually", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ORD-008", "module": "Orders", "desc": "Admin can cancel order and trigger refund", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ORD-009", "module": "Orders", "desc": "Order auto-cancels if payment not received in 15 min", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "paymentTimeoutJob", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ORD-010", "module": "Orders", "desc": "Order tracking page with AWB (public URL)", "source": "Arjun", "priority": "Should Have", "design": "In Progress", "dev": "In Progress", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-ORD-011", "module": "Orders", "desc": "RTO (Return to Origin) status handling", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": "ShipmentStatus.RTO in schema"},
    {"id": "REQ-SHIP-001", "module": "Shipping", "desc": "Delhivery API integration — domestic India", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Not Tested", "evidence": "delhivery.ts", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-SHIP-002", "module": "Shipping", "desc": "Shiprocket integration — international orders", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Not Tested", "evidence": "shiprocket.ts", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-SHIP-003", "module": "Shipping", "desc": "Auto courier selection router (weight + zone + COD logic)", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Not Tested", "evidence": "router.ts", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-SHIP-004", "module": "Shipping", "desc": "AWB auto-generated when order moves to PROCESSING", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "In Progress", "test": "Not Tested", "evidence": "orderLifecycle.ts", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-SHIP-005", "module": "Shipping", "desc": "Pincode serviceability check — India", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "checkout pincode", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-SHIP-006", "module": "Shipping", "desc": "Shipping cost from VariantShippingRate — India and International", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "In Progress", "test": "Not Tested", "evidence": "checkout.service", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-SHIP-007", "module": "Shipping", "desc": "International shipping rates by country (US/GB/OTHER)", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "In Progress", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-SHIP-008", "module": "Shipping", "desc": "No COD for international orders — enforced", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Not Tested", "evidence": "checkout schema", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-NOT-001", "module": "Notifications", "desc": "Email — Order confirmed", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": "SendGrid"},
    {"id": "REQ-NOT-002", "module": "Notifications", "desc": "Email — Payment failed", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-003", "module": "Notifications", "desc": "Email — Order shipped with tracking link", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-004", "module": "Notifications", "desc": "Email — Order delivered", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-005", "module": "Notifications", "desc": "Email — GST invoice attached", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-006", "module": "Notifications", "desc": "WhatsApp — Order confirmed (WATI)", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-007", "module": "Notifications", "desc": "WhatsApp — Shipment dispatched with AWB", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-008", "module": "Notifications", "desc": "WhatsApp — Out for delivery", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-009", "module": "Notifications", "desc": "WhatsApp — Order delivered + review request", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-010", "module": "Notifications", "desc": "GST PDF invoice auto-generated on PAID status", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-011", "module": "Notifications", "desc": "BullMQ email queue — retry on failure", "source": "Technical", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-NOT-012", "module": "Notifications", "desc": "BullMQ WhatsApp queue — retry on failure", "source": "Technical", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ZOHO-001", "module": "Zoho", "desc": "Order paid on Sarveda → auto create Sales Order in Zoho Inventory", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "Level 2 integration live", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ZOHO-002", "module": "Zoho", "desc": "Stock updated in Zoho → reflect on Sarveda website", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ZOHO-003", "module": "Zoho", "desc": "Customer data sync to Zoho CRM", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ZOHO-004", "module": "Zoho", "desc": "Shipment AWB synced back from Zoho to Sarveda", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ZOHO-005", "module": "Zoho", "desc": "Refund recorded in Zoho Books when processed", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-ZOHO-006", "module": "Zoho", "desc": "Nightly full stock sync (safety net)", "source": "Technical", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ZOHO-007", "module": "Zoho", "desc": "Sync failure alert to admin if Zoho order creation fails", "source": "Technical", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ZOHO-008", "module": "Zoho", "desc": "RTO return → stock added back in Zoho Inventory", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-ADM-001", "module": "Admin Panel", "desc": "Dashboard: today's orders, revenue, pending, low stock", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "Admin dashboard", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ADM-002", "module": "Admin Panel", "desc": "Product CRUD — add, edit, delete products", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "Admin products", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ADM-003", "module": "Admin Panel", "desc": "Order management — filter by status, date, customer", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "Admin orders", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-ADM-004", "module": "Admin Panel", "desc": "Inventory management — update stock levels", "source": "Arjun", "priority": "Must Have", "design": "In Progress", "dev": "In Progress", "test": "Not Tested", "evidence": "admin inventory API", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-ADM-005", "module": "Admin Panel", "desc": "Customer management — view all customers", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ADM-006", "module": "Admin Panel", "desc": "Coupon/discount management", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ADM-007", "module": "Admin Panel", "desc": "Revenue reports — daily, weekly, monthly", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ADM-008", "module": "Admin Panel", "desc": "GST report for CA/accounting", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-ADM-009", "module": "Admin Panel", "desc": "Low stock alert system", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": "Dashboard shows low stock count"},
    {"id": "REQ-ADM-010", "module": "Admin Panel", "desc": "Admin mobile responsive — works on phone", "source": "Arjun", "priority": "Should Have", "design": "In Progress", "dev": "In Progress", "test": "Not Tested", "evidence": "", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-ADM-011", "module": "Admin Panel", "desc": "Role-based access control (RBAC)", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-UX-001", "module": "UI/UX", "desc": "Mobile-first design — Android app feel", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "BottomNav", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-UX-002", "module": "UI/UX", "desc": "Bottom navigation bar on mobile", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "BottomNav.tsx", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-UX-003", "module": "UI/UX", "desc": "Announcement bar (free shipping, offers)", "source": "Arjun", "priority": "Should Have", "design": "Complete", "dev": "Complete", "test": "Not Tested", "evidence": "SiteHeader", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-UX-004", "module": "UI/UX", "desc": "Premium homepage — hero, categories, testimonials", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Not Tested", "evidence": "app/page.tsx", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-UX-005", "module": "UI/UX", "desc": "Page transitions — smooth navigation", "source": "Arjun", "priority": "Should Have", "design": "Complete", "dev": "Complete", "test": "Not Tested", "evidence": "PageTransition", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-UX-006", "module": "UI/UX", "desc": "PWA support — Add to Home Screen", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-UX-007", "module": "UI/UX", "desc": "Framer Motion scroll animations", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-UX-008", "module": "UI/UX", "desc": "Custom gold cursor effect on desktop", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-UX-009", "module": "UI/UX", "desc": "Skeleton loaders on all data-fetching pages", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": "Partial on some pages"},
    {"id": "REQ-INF-001", "module": "Infrastructure", "desc": "Frontend deployed on Vercel", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "sarveda-demo.xyz", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-INF-002", "module": "Infrastructure", "desc": "Backend deployed on AWS EC2 Mumbai", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "13.206.192.106", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-INF-003", "module": "Infrastructure", "desc": "PostgreSQL on AWS RDS", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "RDS Mumbai", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-INF-004", "module": "Infrastructure", "desc": "Redis on EC2 for BullMQ", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "localhost:6379", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-INF-005", "module": "Infrastructure", "desc": "sarveda-demo.xyz domain purchased and configured", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "Vercel domain", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-INF-006", "module": "Infrastructure", "desc": "SSL/HTTPS on EC2 backend (nginx + certbot)", "source": "Technical", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 5", "notes": "API via Vercel proxy today"},
    {"id": "REQ-INF-007", "module": "Infrastructure", "desc": "api.sarveda-demo.xyz subdomain for backend", "source": "Technical", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 5", "notes": ""},
    {"id": "REQ-INF-008", "module": "Infrastructure", "desc": "PM2 process manager for backend uptime", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "pm2", "sprint": "Sprint 1", "notes": ""},
    {"id": "REQ-INF-009", "module": "Infrastructure", "desc": "Razorpay webhook configured and verified", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "webhook path", "sprint": "Sprint 2", "notes": "Confirm dashboard URL on demo domain"},
    {"id": "REQ-INF-010", "module": "Infrastructure", "desc": "Google OAuth credentials for sarveda-demo.xyz", "source": "Technical", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "GCP OAuth", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-CRS-001", "module": "Courses", "desc": "Course listing page", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-CRS-002", "module": "Courses", "desc": "Course purchase flow with Stripe/PayPal", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-CRS-003", "module": "Courses", "desc": "Student portal — access purchased courses", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-CRS-004", "module": "Courses", "desc": "Live session Zoom link delivery after purchase", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-CRS-005", "module": "Courses", "desc": "Pre-recorded video course playback", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": ""},
    {"id": "REQ-CRS-006", "module": "Courses", "desc": "Course completion certificate", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 5", "notes": ""},
    {"id": "REQ-CRS-007", "module": "Courses", "desc": "Himalayan Retreat booking page with $900 pricing", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 4", "notes": "Retreat pages exist separately"},
    {"id": "REQ-MKT-001", "module": "Marketing", "desc": "Google Analytics 4 integration", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-MKT-002", "module": "Marketing", "desc": "Meta/Facebook Pixel integration", "source": "Arjun", "priority": "Should Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-MKT-003", "module": "Marketing", "desc": "Newsletter signup with email collection", "source": "Arjun", "priority": "Must Have", "design": "Complete", "dev": "Complete", "test": "Pass", "evidence": "NewsletterForm", "sprint": "Sprint 2", "notes": ""},
    {"id": "REQ-MKT-004", "module": "Marketing", "desc": "Coupon code system — % and flat discount", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-MKT-005", "module": "Marketing", "desc": "SEO — meta tags, OG tags, sitemap", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": ""},
    {"id": "REQ-MKT-006", "module": "Marketing", "desc": "Referral / affiliate program", "source": "Arjun", "priority": "Nice to Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 5", "notes": ""},
    {"id": "REQ-MKT-007", "module": "Marketing", "desc": "WELCOME10 — 10% first order coupon", "source": "Arjun", "priority": "Must Have", "design": "Not Started", "dev": "Not Started", "test": "Not Tested", "evidence": "", "sprint": "Sprint 3", "notes": "Copy in announcement bar only"},
]

for row in ROWS:
    rid = row["id"]
    if rid in AUDIT:
        dev, test, note = AUDIT[rid]
        row["dev"] = dev
        row["test"] = test
        prefix = note + " "
        row["notes"] = (prefix + row["notes"]).strip()


def apply_audit_desc_fix():
    for row in ROWS:
        if row["id"] == "REQ-CART-003":
            row["desc"] = "Stock reserved at checkout — released if not paid in 15 min"


apply_audit_desc_fix()


def col_letter(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def cell_ref(row: int, col: int) -> str:
    return f"{col_letter(col)}{row}"


class XlsxWriter:
    def __init__(self) -> None:
        self.shared: list[str] = []
        self.shared_index: dict[str, int] = {}
        self.sheets: list[tuple[str, list[list[str]]]] = []

    def s(self, text: str) -> int:
        if text not in self.shared_index:
            self.shared_index[text] = len(self.shared)
            self.shared.append(text)
        return self.shared_index[text]

    def add_sheet(self, name: str, rows: list[list[str]]) -> None:
        self.sheets.append((name, rows))

    def _sheet_xml(self, rows: list[list[str]]) -> str:
        lines = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            "<sheetData>",
        ]
        for r_idx, row in enumerate(rows, start=1):
            lines.append(f'<row r="{r_idx}">')
            for c_idx, val in enumerate(row, start=1):
                if val == "":
                    continue
                ref = cell_ref(r_idx, c_idx)
                if val.isdigit() and len(val) < 10:
                    lines.append(f'<c r="{ref}"><v>{val}</v></c>')
                else:
                    si = self.s(val)
                    lines.append(f'<c r="{ref}" t="s"><v>{si}</v></c>')
            lines.append("</row>")
        lines.extend(["</sheetData>", "</worksheet>"])
        return "".join(lines)

    def save(self, path: Path) -> None:
        # Render sheets first — populates self.shared (was empty when built before sheets).
        sheet_xmls = [self._sheet_xml(rows) for _, rows in self.sheets]

        shared_xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
        shared_xml.append(
            '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'
            + str(len(self.shared))
            + '" uniqueCount="'
            + str(len(self.shared))
            + '">'
        )
        for t in self.shared:
            if "\n" in t or "\r" in t:
                shared_xml.append(f'<si><t xml:space="preserve">{escape(t)}</t></si>')
            else:
                shared_xml.append(f"<si><t>{escape(t)}</t></si>")
        shared_xml.append("</sst>")

        rels = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
            "</Relationships>",
        ]
        wb_rels = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
        ]
        for i in range(2, len(self.sheets) + 2):
            wb_rels.append(
                f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i - 1}.xml"/>'
            )
        ss_rid = len(self.sheets) + 2
        wb_rels.append(
            f'<Relationship Id="rId{ss_rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        )
        wb_rels.append("</Relationships>")

        wb = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
            "<sheets>",
        ]
        for i, (name, _) in enumerate(self.sheets, start=1):
            wb.append(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i+1}"/>')
        wb.extend(["</sheets>", "</workbook>"])

        styles = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>"""

        content_types = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
            '<Default Extension="xml" ContentType="application/xml"/>',
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>',
        ]
        for i in range(1, len(self.sheets) + 1):
            content_types.append(
                f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            )
        content_types.append(
            '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        )
        content_types.append("</Types>")

        core = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Sarveda RTM v1.1</dc:title>
  <dc:creator>Sarveda Dev Audit</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">{date.today().isoformat()}T00:00:00Z</dcterms:created>
</cp:coreProperties>"""

        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", "".join(content_types))
            z.writestr("_rels/.rels", "".join(rels))
            z.writestr("docProps/core.xml", core)
            z.writestr("xl/workbook.xml", "".join(wb))
            z.writestr("xl/_rels/workbook.xml.rels", "".join(wb_rels))
            z.writestr("xl/styles.xml", styles)
            z.writestr("xl/sharedStrings.xml", "".join(shared_xml))
            for i, xml in enumerate(sheet_xmls, start=1):
                z.writestr(f"xl/worksheets/sheet{i}.xml", xml)


FULL_HEADER = [
    "REQ ID",
    "Module",
    "Requirement Description",
    "Source",
    "Priority",
    "Design Status",
    "Dev Status",
    "Test Status",
    "Test Evidence",
    "Sprint",
    "Notes / Comments",
    "Deploy Dependency",
    "Date Revised",
    "Sign-off",
]

MODULE_SHORT = {
    "Authentication": "AUTH",
    "Products": "PROD",
    "Cart & Checkout": "CART",
    "Payments": "PAY",
    "Orders": "ORD",
    "Shipping": "SHIP",
    "Notifications": "NOT",
    "Zoho": "ZOHO",
    "Admin Panel": "ADM",
    "UI/UX": "UX",
    "Infrastructure": "INF",
    "Courses": "CRS",
    "Marketing": "MKT",
}


def deploy_note(row: dict) -> str:
    notes = []
    if row["id"] in ("REQ-PROD-002", "REQ-PROD-003"):
        notes.append("EC2: import/sync scripts")
    if row["id"].startswith("REQ-NOT-") and row["id"] != "REQ-NOT-012":
        if row["dev"] != "Not Started":
            notes.append("EC2: SENDGRID_API_KEY")
    if row["id"] == "REQ-ZOHO-001":
        notes.append("External — not in Git")
    if row["test"] == "Pass":
        notes.append("Verified in codebase audit")
    return "; ".join(notes)


def stats():
    total = len(ROWS)
    must = sum(1 for r in ROWS if r["priority"] == "Must Have")
    complete = sum(1 for r in ROWS if r["dev"] == "Complete")
    in_prog = sum(1 for r in ROWS if r["dev"] == "In Progress")
    not_started = sum(1 for r in ROWS if r["dev"] == "Not Started")
    passed = sum(1 for r in ROWS if r["test"] == "Pass")
    return total, must, complete, in_prog, not_started, passed


def module_stats():
    by_mod: dict[str, list[dict]] = defaultdict(list)
    for r in ROWS:
        by_mod[r["module"]].append(r)
    out = []
    for mod, items in sorted(by_mod.items(), key=lambda x: x[0]):
        total = len(items)
        must = sum(1 for i in items if i["priority"] == "Must Have")
        should = sum(1 for i in items if i["priority"] == "Should Have")
        nice = sum(1 for i in items if i["priority"] == "Nice to Have")
        ns = sum(1 for i in items if i["dev"] == "Not Started")
        ip = sum(1 for i in items if i["dev"] == "In Progress")
        cp = sum(1 for i in items if i["dev"] == "Complete")
        tp = sum(1 for i in items if i["test"] == "Pass")
        pct = round(100 * cp / total) if total else 0
        out.append([mod, str(total), str(must), str(should), str(nice), str(ns), str(ip), str(cp), str(tp), f"{pct}%"])
    return out


def full_rtm_rows() -> list[list[str]]:
    rows = [
        ["SARVEDA — Full Requirements Traceability Matrix (v1.1 — audited)"],
        [f"Code audit: {date.today().strftime('%d %b %Y')} · Staging: sarveda-demo.xyz · Confidential"],
        [],
        FULL_HEADER,
    ]
    current = ""
    for r in ROWS:
        if r["module"] != current:
            current = r["module"]
            rows.append([f"  ▶  {current.upper()}"] + [""] * (len(FULL_HEADER) - 1))
        rows.append(
            [
                r["id"],
                r["module"],
                r["desc"],
                r["source"],
                r["priority"],
                r["design"],
                r["dev"],
                r["test"],
                r["evidence"],
                r["sprint"],
                r["notes"],
                deploy_note(r),
                date.today().strftime("%d-%b-%Y"),
                "",
            ]
        )
    return rows


def module_sheet_rows(mod: str) -> list[list[str]]:
    items = [r for r in ROWS if r["module"] == mod]
    short = MODULE_SHORT.get(mod, mod[:4])
    header = ["REQ ID", "Requirement", "Source", "Priority", "Design", "Dev", "Test", "Evidence", "Sprint", "Notes", "Deploy", "Sign-off"]
    rows = [[f"{short} — Requirements"], [], header]
    for r in items:
        rows.append(
            [
                r["id"],
                r["desc"],
                r["source"],
                r["priority"],
                r["design"],
                r["dev"],
                r["test"],
                r["evidence"],
                r["sprint"],
                r["notes"],
                deploy_note(r),
                "",
            ]
        )
    return rows


def dashboard_rows() -> list[list[str]]:
    total, must, complete, in_prog, not_started, passed = stats()
    rows = [
        ["SARVEDA — Requirements Traceability Matrix (v1.1 AUDITED)"],
        [f"eCommerce Platform Migration · Audited: {date.today().strftime('%d %b %Y')} · Confidential"],
        [],
        ["Total Requirements", "", "Must Have", "", "Complete", "", "In Progress", "", "Tests Passed", "", "Dev %"],
        [
            str(total),
            "",
            str(must),
            "",
            str(complete),
            "",
            str(in_prog),
            "",
            str(passed),
            "",
            f"{round(100*complete/total)}%",
        ],
        [],
        ["MODULE BREAKDOWN"],
        ["Module", "Total", "Must Have", "Should Have", "Nice to Have", "Not Started", "In Progress", "Complete", "Tests Passed", "% Dev Done"],
    ]
    rows.extend(module_stats())
    rows.extend(
        [
            [],
            ["AUDIT LEGEND"],
            ["Complete (Dev)", "Implemented in GitHub repo (main branch)"],
            ["In Progress", "Partial / needs EC2 env / needs staging E2E test"],
            ["Pass (Test)", "Verified in code review — not always live on demo"],
            [],
            ["OWNER SUMMARY"],
            ["Storefront + Razorpay + Admin", "Production-capable on sarveda-demo.xyz with env keys"],
            ["Email / WhatsApp / Zoho L2 in repo", "Email wired — needs SendGrid; WhatsApp & Zoho not in repo"],
            ["Before demo polish", "Run import:variations, sync:galleries, migrate:media on EC2"],
        ]
    )
    return rows


def main() -> None:
    w = XlsxWriter()
    w.add_sheet("Dashboard", dashboard_rows())
    w.add_sheet("Full RTM", full_rtm_rows())
    for mod in [
        "Authentication",
        "Products",
        "Cart & Checkout",
        "Payments",
        "Orders",
        "Shipping",
        "Notifications",
        "Zoho",
        "Admin Panel",
        "UI/UX",
        "Infrastructure",
        "Courses",
        "Marketing",
    ]:
        w.add_sheet(mod[:31], module_sheet_rows(mod))
    w.save(OUT)
    total, must, complete, in_prog, _, passed = stats()
    print(f"Wrote {OUT}")
    print(f"Stats: {complete}/{total} Complete dev, {in_prog} In Progress, {passed} Test Pass")


if __name__ == "__main__":
    main()
