#!/usr/bin/env python3
"""
Refresh Sarveda-RTM-v1.1-audited.csv with May 2026 demo status.
Usage: python3 scripts/update-rtm-may-2026.py
"""
from __future__ import annotations

import csv
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "Sarveda-RTM-v1.1-audited.csv"
REVISED = date.today().strftime("%d-%b-%Y")

# REQ ID -> (Dev, Test, Evidence append or replace, Notes append)
UPDATES: dict[str, tuple[str, str, str, str]] = {
    # Auth & UX (May 2026 sprint)
    "REQ-AUTH-003": ("Not Started", "Not Tested", "", "Forgot-password API still pending."),
    "REQ-PROD-002": ("Complete", "Pass", "sync:galleries + S3", "May 2026: Galleries on demo."),
    "REQ-PROD-003": ("Complete", "Pass", "import:variations", "May 2026: 1036 variants linked on EC2."),
    "REQ-PROD-004": ("Complete", "Pass", "sync:audio + media XML", "May 2026: ~38 audio products on demo."),
    "REQ-PROD-009": ("Complete", "Pass", "RelatedProducts", "On PDP."),
    "REQ-PROD-011": ("Complete", "Pass", "checkout/shipping API", "By design: pincode at checkout only (not PDP)."),
    "REQ-PROD-012": ("Complete", "Pass", "ProductBuyBox", "Estimated delivery on PDP."),
    "REQ-PROD-013": ("In Progress", "Not Tested", "/search", "Search live; advanced filters partial."),
    "REQ-CART-004": ("Complete", "Pass", "/cart + PDP rail", "Cart page + rail; guest merge fix May 2026."),
    "REQ-CART-006": ("Complete", "Pass", "CouponInput + API", "May 2026: WELCOME10 verified on demo."),
    "REQ-CART-007": ("Complete", "Pass", "guest checkout", "Tested on demo."),
    "REQ-CART-009": ("Complete", "Pass", "checkout.service", "Including digital $0 shipping."),
    "REQ-CART-010": ("In Progress", "Not Tested", "", "GST-inclusive prices; line breakdown TBD."),
    "REQ-PAY-002": ("Complete", "Pass", "Stripe", "May 2026: E2E tested on demo."),
    "REQ-PAY-003": ("Complete", "Pass", "PayPal", "May 2026: E2E tested on demo."),
    "REQ-PAY-004": ("Complete", "Not Tested", "COD checkout", "Implemented; formal sign-off pending."),
    "REQ-PAY-009": ("Complete", "Pass", "geo middleware + zone prices", "May 2026: INR/USD/GBP on shop+PDP."),
    "REQ-ORD-003": ("Complete", "Pass", "/profile YourOrders", ""),
    "REQ-ORD-004": ("Complete", "Pass", "orders API", ""),
    "REQ-ORD-005": ("Complete", "Pass", "invoice PDF", "May 2026: GST invoice generated on paid orders."),
    "REQ-ORD-010": ("Complete", "Pass", "/track/[awb]", ""),
    "REQ-SHIP-004": ("Complete", "Pass", "admin AWB button", "May 2026: Manual AWB generation verified."),
    "REQ-SHIP-001": ("In Progress", "Not Tested", "delhivery.ts", "Module exists; full courier E2E pending."),
    "REQ-SHIP-002": ("In Progress", "Not Tested", "shiprocket.ts", ""),
    "REQ-SHIP-003": ("In Progress", "Not Tested", "router.ts", ""),
    "REQ-SHIP-005": ("Complete", "Pass", "checkout pincode", ""),
    "REQ-NOT-001": ("Complete", "Pass", "SendGrid", "May 2026: Order emails on demo."),
    "REQ-NOT-002": ("Complete", "Pass", "SendGrid", ""),
    "REQ-NOT-003": ("Complete", "Pass", "SendGrid", ""),
    "REQ-NOT-004": ("Complete", "Pass", "SendGrid", ""),
    "REQ-NOT-005": ("Complete", "Pass", "invoice email", ""),
    "REQ-NOT-006": ("Deferred", "Not Tested", "", "WATI deferred per client May 2026."),
    "REQ-NOT-007": ("Deferred", "Not Tested", "", "WATI deferred."),
    "REQ-NOT-008": ("Deferred", "Not Tested", "", "WATI deferred."),
    "REQ-NOT-009": ("Deferred", "Not Tested", "", "WATI deferred."),
    "REQ-NOT-010": ("Complete", "Pass", "ensureOrderInvoicePdf", ""),
    "REQ-NOT-011": ("In Progress", "Not Tested", "sync email", "BullMQ retry queue TBD."),
    "REQ-NOT-012": ("Deferred", "Not Tested", "", "WATI deferred."),
    "REQ-UX-003": ("Complete", "Pass", "Header announcement", ""),
    "REQ-UX-004": ("Complete", "Pass", "Homepage + experience rails", "May 2026: Courses/events/insights on home."),
    "REQ-UX-009": ("In Progress", "Not Tested", "", "Partial skeleton loaders."),
    "REQ-CRS-001": ("Complete", "Pass", "/courses", "May 2026: Full-image cards; upcoming/past sections."),
    "REQ-CRS-002": ("In Progress", "Pass", "cart + digital checkout", "Courses/events pay via cart; Enrollment/Booking on paid. No lesson player."),
    "REQ-CRS-003": ("In Progress", "Not Tested", "/profile", "My courses/events list only — not full portal."),
    "REQ-CRS-004": ("Not Started", "Not Tested", "", "Zoom link email automation pending."),
    "REQ-CRS-007": ("In Progress", "Pass", "/retreat + corporate", "Corporate wellness + program pages live."),
    "REQ-MKT-004": ("Complete", "Pass", "coupons API", "May 2026: Checkout coupons verified."),
    "REQ-MKT-005": ("In Progress", "Not Tested", "sitemap.xml", "Core SEO done; 22 WP sitemaps + 301 map pending launch."),
    "REQ-MKT-007": ("Complete", "Pass", "WELCOME10", "Verified on demo."),
    "REQ-INF-009": ("Complete", "Pass", "Razorpay webhook", "Demo domain configured."),
}

NEW_ROWS = [
    {
        "REQ ID": "REQ-EVT-001",
        "Module": "Courses",
        "Description": "Events listing page (upcoming / past) — sarveda.com parity",
        "Priority": "Must Have",
        "Design": "Complete",
        "Dev": "Complete",
        "Test": "Pass",
        "Evidence": "/events",
        "Sprint": "Sprint 4",
        "Notes": f"May 2026: Full-image EventCard layout. Revised {REVISED}.",
    },
    {
        "REQ ID": "REQ-INS-001",
        "Module": "Marketing",
        "Description": "Insights blog listing — full-image cards",
        "Priority": "Must Have",
        "Design": "Complete",
        "Dev": "Complete",
        "Test": "Pass",
        "Evidence": "/insights",
        "Sprint": "Sprint 4",
        "Notes": f"May 2026: Blog grid; category filter like ?cat= pending. Revised {REVISED}.",
    },
    {
        "REQ ID": "REQ-UX-010",
        "Module": "UI/UX",
        "Description": "Main nav: Courses, Events, Corporate Wellness, Insights (mobile + desktop)",
        "Priority": "Must Have",
        "Design": "Complete",
        "Dev": "Complete",
        "Test": "Pass",
        "Evidence": "Header + mobile menu",
        "Sprint": "Sprint 4",
        "Notes": f"May 2026: Chat tab removed from bottom nav (route kept). Revised {REVISED}.",
    },
    {
        "REQ ID": "REQ-UX-011",
        "Module": "UI/UX",
        "Description": "Password show/hide on login and signup",
        "Priority": "Should Have",
        "Design": "Complete",
        "Dev": "Complete",
        "Test": "Pass",
        "Evidence": "PasswordInput",
        "Sprint": "Sprint 4",
        "Notes": f"May 2026. Revised {REVISED}.",
    },
    {
        "REQ ID": "REQ-UX-012",
        "Module": "UI/UX",
        "Description": "Sign out clears session on all pages (header + mobile)",
        "Priority": "Must Have",
        "Design": "Complete",
        "Dev": "Complete",
        "Test": "Pass",
        "Evidence": "logoutSession + auth event",
        "Sprint": "Sprint 4",
        "Notes": f"May 2026: Fixed stale session UI. Revised {REVISED}.",
    },
]

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

    existing_ids = {r["REQ ID"] for r in rows}
    for nr in NEW_ROWS:
        if nr["REQ ID"] not in existing_ids:
            rows.append(nr)

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    dev_c = Counter(r["Dev"] for r in rows)
    test_c = Counter(r["Test"] for r in rows)
    must = [r for r in rows if r["Priority"] == "Must Have"]
    must_dev_done = sum(1 for r in must if r["Dev"] in ("Complete", "Deferred"))
    must_test_pass = sum(1 for r in must if r["Test"] == "Pass")

    print(f"Wrote {len(rows)} rows to {CSV_PATH.name}")
    print(f"Dev: {dict(dev_c)}")
    print(f"Test: {dict(test_c)}")
    print(f"Must Have ({len(must)}): Dev done/deferred {must_dev_done} ({100*must_dev_done//len(must)}%)")
    print(f"Must Have: Test Pass {must_test_pass} ({100*must_test_pass//len(must)}%)")


if __name__ == "__main__":
    main()
