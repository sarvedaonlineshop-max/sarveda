#!/usr/bin/env python3
"""
Refresh Sarveda-RTM-v1.1-audited.csv with Jun 2026 sprint completions.
Usage: python3 scripts/update-rtm-jun-2026.py
"""
from __future__ import annotations

import csv
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "Sarveda-RTM-v1.1-audited.csv"
REVISED = date.today().strftime("%d-%b-%Y")

# REQ ID -> (Dev, Test, Evidence, Notes append)
UPDATES: dict[str, tuple[str, str, str, str]] = {
    # Auth
    "REQ-AUTH-003": (
        "Complete",
        "Not Tested",
        "forgot-password + reset-password",
        f"Jun 2026: SendGrid reset flow + PasswordResetToken migration. Revised {REVISED}.",
    ),
    # Products
    "REQ-PROD-010": (
        "Complete",
        "Not Tested",
        "reviews.routes + ProductReviewsSection + /admin/reviews",
        f"Jun 2026: Submit, moderation, verified purchase badge. Revised {REVISED}.",
    ),
    "REQ-PROD-014": (
        "Complete",
        "Not Tested",
        "Product.hsnCode + gst.ts + invoice PDF",
        f"Jun 2026: Admin HSN field; DEFAULT_HSN_CODE fallback. Revised {REVISED}.",
    ),
    # Cart & checkout
    "REQ-CART-005": (
        "Complete",
        "Not Tested",
        "FreeShippingBar.tsx",
        f"Jun 2026: INR ₹999 threshold (env configurable). Revised {REVISED}.",
    ),
    "REQ-CART-010": (
        "Complete",
        "Not Tested",
        "PaymentSelector + order/confirmed GST row",
        f"Jun 2026: Back-calculated GST from inclusive prices. Revised {REVISED}.",
    ),
    "REQ-CART-011": (
        "In Progress",
        "Not Tested",
        "abandonedNotificationJob + emailQueue",
        f"Jun 2026: Email abandoned cart + payment reminder; WhatsApp still deferred. Revised {REVISED}.",
    ),
    # Payments & orders
    "REQ-PAY-008": (
        "Complete",
        "Not Tested",
        "refund.service.ts",
        f"Jun 2026: Razorpay/Stripe/PayPal gateway refunds. Revised {REVISED}.",
    ),
    "REQ-ORD-008": (
        "Complete",
        "Not Tested",
        "admin refund + cancel routes",
        f"Jun 2026: RefundCancelPanel on order detail. Revised {REVISED}.",
    ),
    "REQ-ORD-011": (
        "Complete",
        "Not Tested",
        "handleRtoShipment + shiprocket webhook",
        f"Jun 2026: RTO → cancel + customer email. Revised {REVISED}.",
    ),
    # Notifications
    "REQ-NOT-011": (
        "Complete",
        "Not Tested",
        "jobs/emailQueue.ts",
        f"Jun 2026: BullMQ 5-attempt exponential backoff; worker in server.ts. Revised {REVISED}.",
    ),
    # Marketing / analytics
    "REQ-MKT-001": (
        "Complete",
        "Not Tested",
        "layout.tsx NEXT_PUBLIC_GA4_ID",
        f"Jun 2026: Production-only gtag. Set on Vercel. Revised {REVISED}.",
    ),
    "REQ-MKT-002": (
        "Complete",
        "Not Tested",
        "layout.tsx Meta Pixel",
        f"Jun 2026: Production-only fbq; analytics.ts events. Revised {REVISED}.",
    ),
    # Admin
    "REQ-ADM-005": (
        "Complete",
        "Not Tested",
        "/admin/customers",
        f"Jun 2026: Customer list + search. Revised {REVISED}.",
    ),
    "REQ-ADM-006": (
        "Complete",
        "Not Tested",
        "/admin/coupons + coupon.admin.routes",
        f"Jun 2026: Full CRUD + deactivate. Revised {REVISED}.",
    ),
    "REQ-ADM-007": (
        "Complete",
        "Not Tested",
        "/admin/reports",
        f"Jun 2026: Revenue KPIs, 30-day chart, movers. Revised {REVISED}.",
    ),
    "REQ-ADM-004": (
        "Complete",
        "Pass",
        "admin inventory + Zoho out-of-sync UI",
        f"Jun 2026: Paginated inventory; Zoho sync tabs. Revised {REVISED}.",
    ),
    # Infrastructure (config ready; deploy pending)
    "REQ-INF-006": (
        "In Progress",
        "Not Tested",
        "backend/nginx/sarveda-api.conf",
        f"Jun 2026: nginx + certbot README; EC2 apply pending. Revised {REVISED}.",
    ),
    "REQ-INF-007": (
        "In Progress",
        "Not Tested",
        "nginx server_name api.sarveda-demo.xyz",
        f"Jun 2026: DNS → 13.206.192.106 + SSL pending. Revised {REVISED}.",
    ),
    # Shipping hardening (still E2E sign-off)
    "REQ-SHIP-001": (
        "In Progress",
        "Not Tested",
        "delhivery.ts + assertDelhiveryConfigured",
        f"Jun 2026: API module + router; live AWB sign-off pending. Revised {REVISED}.",
    ),
    "REQ-SHIP-002": (
        "In Progress",
        "Not Tested",
        "shiprocket.ts 10s timeout",
        f"Jun 2026: createInternationalShipment; live AWB sign-off pending. Revised {REVISED}.",
    ),
    "REQ-SHIP-003": (
        "In Progress",
        "Not Tested",
        "router.ts + shippingRetryJob",
        f"Jun 2026: AWB upsert, shippingLastError, test-shipping.ts. Revised {REVISED}.",
    ),
    # Zoho — partial implementation in repo
    "REQ-ZOHO-001": (
        "In Progress",
        "Not Tested",
        "zoho-invoices.ts + afterPaid",
        f"Jun 2026: Invoice on PAID; sales order E2E needs prod credentials. Revised {REVISED}.",
    ),
    "REQ-ZOHO-002": (
        "In Progress",
        "Not Tested",
        "zoho-inventory.ts pull/push",
        f"Jun 2026: Stock sync + admin out-of-sync UI. Revised {REVISED}.",
    ),
    "REQ-ZOHO-006": (
        "In Progress",
        "Not Tested",
        "zohoStockSyncJob",
        f"Jun 2026: Nightly/history sync job wired. Revised {REVISED}.",
    ),
    "REQ-ZOHO-007": (
        "In Progress",
        "Not Tested",
        "ZOHO_INVOICE_FAILED logging",
        f"Jun 2026: Failure logs + admin audit cache. Revised {REVISED}.",
    ),
    "REQ-ZOHO-003": (
        "In Progress",
        "Not Tested",
        "zoho-contacts.ts",
        f"Jun 2026: getOrCreateZohoContact on invoice path. Revised {REVISED}.",
    ),
    "REQ-ZOHO-004": (
        "Not Started",
        "Not Tested",
        "",
        f"Jun 2026: AWB → Zoho not wired. Revised {REVISED}.",
    ),
    "REQ-ZOHO-005": (
        "Not Started",
        "Not Tested",
        "",
        f"Jun 2026: Refund → Zoho Books not wired. Revised {REVISED}.",
    ),
    "REQ-ZOHO-008": (
        "Not Started",
        "Not Tested",
        "",
        f"Jun 2026: RTO stock return to Zoho not wired. Revised {REVISED}.",
    ),
}

FIELDNAMES = [
    "REQ ID",
    "Module",
    "Description",
    "Priority",
    "Design",
    "Dev",
    "Test",
    "Evidence",
    "Sprint",
    "Notes",
]


def merge_note(existing: str, append: str) -> str:
    if not append:
        return existing
    if not existing:
        return append
    if append in existing:
        return existing
    return f"{append} {existing}".strip()


def main() -> None:
    rows: list[dict[str, str]] = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            req_id = (row.get("REQ ID") or "").strip()
            if req_id in UPDATES:
                dev, test, evidence, note = UPDATES[req_id]
                row["Dev"] = dev
                row["Test"] = test
                if evidence:
                    row["Evidence"] = evidence
                row["Notes"] = merge_note(row.get("Notes", ""), note)
            rows.append(row)

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    dev_c = Counter(r["Dev"] for r in rows)
    test_c = Counter(r["Test"] for r in rows)
    must = [r for r in rows if r["Priority"] == "Must Have"]
    must_dev_done = sum(1 for r in must if r["Dev"] in ("Complete", "Deferred"))
    must_test_pass = sum(1 for r in must if r["Test"] == "Pass")
    total = len(rows)
    complete = dev_c.get("Complete", 0)
    not_started = dev_c.get("Not Started", 0)
    in_progress = dev_c.get("In Progress", 0)
    deferred = dev_c.get("Deferred", 0)
    incomplete = not_started + in_progress + deferred

    print(f"Wrote {total} rows to {CSV_PATH.name}")
    print(f"Dev Complete: {complete} ({100 * complete // total}%)")
    print(f"Dev incomplete: {incomplete} ({100 * incomplete // total}%) — NS:{not_started} IP:{in_progress} Def:{deferred}")
    print(f"Dev: {dict(dev_c)}")
    print(f"Test: {dict(test_c)}")
    print(f"Must Have ({len(must)}): Dev done/deferred {must_dev_done} ({100 * must_dev_done // len(must)}%)")
    print(f"Must Have: Test Pass {must_test_pass} ({100 * must_test_pass // len(must)}%)")


if __name__ == "__main__":
    main()
