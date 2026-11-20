# Sarveda commercial quote pack

## Development fee (catch-up) — 20 Nov 2026

Workbook: [`Sarveda_Development_Fee_Quote_Till_2026-11-20.xlsx`](./Sarveda_Development_Fee_Quote_Till_2026-11-20.xlsx)

Accounting-only split (13 items, **each line ÷ 10** → ₹1,75,800): [`Sarveda_Accounting_Module_Fee_Split_2026-11-20.xlsx`](./Sarveda_Accounting_Module_Fee_Split_2026-11-20.xlsx)

- **Quoted (this invoice):** ₹85,00,000 + 18% GST = **₹1,00,30,000**
- **Already received:** ₹0
- **Market replacement (not billed):** ~₹1.62 crore for the same 94 delivered modules — column G on sheet 03, for the CA only
- **AWS monthly Lightsail/S3:** not in this invoice (sheet 04 yellow block; paid to Amazon)

Regenerate after editing line items:

```bash
python3 docs/commercial/generate_development_fee_quote.py
```

Fill bank / GSTIN on sheet 07 outside git. Do not commit secrets.

Meeting notes for items **not** in this bill: `docs/ACCOUNTING-TEAM-MEETING-2026-11-20.md`.
