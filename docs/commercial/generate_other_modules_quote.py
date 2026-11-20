#!/usr/bin/env python3
"""Excel of quoted fees for everything except native accounting.

Run from repo root:
  python3 docs/commercial/generate_other_modules_quote.py
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.page import PageMargins

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import generate_development_fee_quote as src  # noqa: E402

OUT = HERE / "Sarveda_Other_Modules_Fee_Split_2026-11-20.xlsx"

GREEN, CREAM, WHITE, INK, MUTED, LINE, AMBER, TOTAL = (
    "1B4332",
    "F7F4EE",
    "FFFFFF",
    "1A1A1A",
    "5C5C5C",
    "D6D3CD",
    "FFF4D6",
    "081C15",
)
thin = Border(
    left=Side(style="thin", color=LINE),
    right=Side(style="thin", color=LINE),
    top=Side(style="thin", color=LINE),
    bottom=Side(style="thin", color=LINE),
)
fill_green = PatternFill("solid", fgColor=GREEN)
fill_cream = PatternFill("solid", fgColor=CREAM)
fill_white = PatternFill("solid", fgColor=WHITE)
fill_total = PatternFill("solid", fgColor=TOTAL)
fill_amber = PatternFill("solid", fgColor=AMBER)
font_h = Font(name="Calibri", size=12, bold=True, color=WHITE)
font_body = Font(name="Calibri", size=10, color=INK)
font_bold = Font(name="Calibri", size=10, bold=True, color=INK)
font_muted = Font(name="Calibri", size=9, italic=True, color=MUTED)
font_white = Font(name="Calibri", size=11, bold=True, color=WHITE)
inr = '"₹"#,##,##0'
pct = "0.0%"
left = Alignment(vertical="center", wrap_text=True)
center = Alignment(horizontal="center", vertical="center", wrap_text=True)
right = Alignment(horizontal="right", vertical="center")
wrap = Alignment(wrap_text=True, vertical="center")


def is_accounting(code: str, workstream: str) -> bool:
    return code.startswith("J") or "Native accounting" in workstream


def build() -> None:
    rows = [
        (m[0], m[1], m[2], m[3], m[4], quoted, m[5])
        for m, quoted in zip(src.MODULES, src.QUOTED_AMOUNTS)
        if not is_accounting(m[0], m[1])
    ]
    quoted_total = sum(r[5] for r in rows)
    market_total = sum(r[6] for r in rows)
    gst = round(quoted_total * src.GST_RATE)
    payable = quoted_total + gst

    by_ws: dict[str, dict[str, int]] = defaultdict(lambda: {"quoted": 0, "market": 0, "n": 0})
    order: list[str] = []
    for code, ws_name, module, delivered, size, quoted, market in rows:
        if ws_name not in by_ws:
            order.append(ws_name)
        by_ws[ws_name]["quoted"] += quoted
        by_ws[ws_name]["market"] += market
        by_ws[ws_name]["n"] += 1

    wb = Workbook()

    # ------------------------------------------------------------------ cover
    cover = wb.active
    cover.title = "01 Cover"
    cover.page_setup.orientation = "portrait"
    cover.page_setup.fitToPage = True
    cover.page_setup.fitToWidth = 1
    cover.page_margins = PageMargins(0.4, 0.4, 0.6, 0.5)
    for col, w in {"A": 3, "B": 36, "C": 22, "D": 22, "E": 28}.items():
        cover.column_dimensions[col].width = w

    cover.merge_cells("B2:E2")
    cover["B2"] = "SARVEDA"
    cover["B2"].font = Font(name="Calibri", size=14, bold=True, color="B08968")
    cover.merge_cells("B3:E3")
    cover["B3"] = "Other modules — fee split (accounting excluded)"
    cover["B3"].font = Font(name="Calibri", size=18, bold=True, color=GREEN)
    cover.merge_cells("B4:E4")
    cover["B4"] = (
        "Native accounting was sent separately to the owner. This workbook is everything else in the catch-up quote SRV-DEV-2026-001."
    )
    cover["B4"].font = font_muted
    cover["B4"].alignment = wrap
    cover.row_dimensions[4].height = 32

    meta = [
        ("Quote no.", "SRV-DEV-2026-001-OTHER"),
        ("Date", "20 November 2026"),
        ("Scope", "All delivered modules except native accounting (J1–J13)"),
        ("Line items", len(rows)),
        ("Prior payments", 0),
        ("Accounting workbook", "Sent separately — not added here"),
    ]
    cover["B6"] = "Quote details"
    cover["B6"].font = Font(name="Calibri", size=12, bold=True, color=GREEN)
    for i, (k, v) in enumerate(meta):
        r = 7 + i
        cover.cell(r, 2, k).font = font_muted
        cover.cell(r, 2).fill = fill_cream
        cover.cell(r, 3, v).font = font_bold
        cover.cell(r, 3).fill = fill_cream
        if k == "Prior payments":
            cover.cell(r, 3).number_format = inr

    cover["D7"] = "Quoted (ex-GST)"
    cover["D7"].font = font_muted
    cover["E7"] = quoted_total
    cover["E7"].number_format = inr
    cover["E7"].font = Font(name="Calibri", size=16, bold=True, color=GREEN)
    cover["D8"] = "GST 18%"
    cover["D8"].font = font_muted
    cover["E8"] = gst
    cover["E8"].number_format = inr
    cover["E8"].font = font_bold
    cover["D9"] = "PAYABLE"
    cover["D9"].font = font_white
    cover["D9"].fill = fill_green
    cover["E9"] = payable
    cover["E9"].number_format = inr
    cover["E9"].font = Font(name="Calibri", size=16, bold=True, color=WHITE)
    cover["E9"].fill = fill_green
    cover["D10"] = "Market (not billed)"
    cover["D10"].font = font_muted
    cover["E10"] = market_total
    cover["E10"].number_format = inr
    cover["E10"].font = font_muted

    cover.merge_cells("B14:E16")
    cover["B14"] = (
        "Do not add this total to the accounting sheet if that sheet was already sent at a revised (÷10) rate — "
        "the two workbooks are separate bills. Amazon monthly Lightsail/S3 is still not in either workbook."
    )
    cover["B14"].alignment = wrap
    cover["B14"].font = font_body

    # ------------------------------------------------------------------ summary
    sm = wb.create_sheet("02 Workstream summary")
    sm.page_setup.orientation = "landscape"
    sm.page_setup.fitToPage = True
    sm.page_setup.fitToWidth = 1
    sm.page_margins = PageMargins(0.4, 0.4, 0.6, 0.5)
    sm.freeze_panes = "A5"
    sm.column_dimensions["A"].width = 3
    sm.column_dimensions["B"].width = 62
    sm.column_dimensions["C"].width = 18
    sm.column_dimensions["D"].width = 18
    sm.column_dimensions["E"].width = 14
    sm.column_dimensions["F"].width = 14

    sm.merge_cells("A1:F1")
    sm["A1"] = "Other modules by workstream  ·  accounting excluded"
    sm["A1"].font = Font(name="Calibri", size=14, bold=True, color=WHITE)
    sm["A1"].fill = fill_green
    sm.merge_cells("A2:F2")
    sm["A2"] = "Quoted column is this invoice. Market is metro-agency replacement for the same work (not billed)."
    sm["A2"].font = font_muted

    for col, h in enumerate(["", "Workstream", "Quoted fee (INR)", "Market (INR)", "% of this bill", "Modules"], 1):
        c = sm.cell(4, col, h)
        c.fill = fill_green
        c.font = font_h
        c.alignment = center
        c.border = thin

    start = 5
    for i, name in enumerate(order):
        r = start + i
        sm.cell(r, 2, name).font = font_body
        sm.cell(r, 2).alignment = left
        sm.cell(r, 3, by_ws[name]["quoted"]).number_format = inr
        sm.cell(r, 4, by_ws[name]["market"]).number_format = inr
        sm.cell(r, 5, f"=C{r}/$C${start + len(order)}")
        sm.cell(r, 5).number_format = pct
        sm.cell(r, 6, by_ws[name]["n"]).alignment = center
        for col in range(2, 7):
            sm.cell(r, col).border = thin
            if i % 2:
                sm.cell(r, col).fill = fill_cream
        sm.row_dimensions[r].height = 20

    tot = start + len(order)
    sm.merge_cells(start_row=tot, start_column=2, end_row=tot, end_column=2)
    sm.cell(tot, 2, "TOTAL other modules (ex-GST)")
    sm.cell(tot, 3, f"=SUM(C{start}:C{tot - 1})")
    sm.cell(tot, 4, f"=SUM(D{start}:D{tot - 1})")
    sm.cell(tot, 5, 1)
    sm.cell(tot, 5).number_format = pct
    sm.cell(tot, 6, f"=SUM(F{start}:F{tot - 1})")
    for col in range(2, 7):
        sm.cell(tot, col).fill = fill_total
        sm.cell(tot, col).font = font_white
        sm.cell(tot, col).border = thin
        sm.cell(tot, col).number_format = inr if col in (3, 4) else sm.cell(tot, col).number_format
    sm.cell(tot, 3).number_format = inr
    sm.cell(tot, 4).number_format = inr
    sm.cell(tot, 6).alignment = center
    sm.row_dimensions[tot].height = 22

    gst_r = tot + 1
    sm.cell(gst_r, 2, "GST 18% (SAC 998314)")
    sm.cell(gst_r, 3, f"=C{tot}*0.18")
    sm.cell(gst_r, 3).number_format = inr
    for col in range(2, 7):
        sm.cell(gst_r, col).fill = fill_amber
        sm.cell(gst_r, col).border = thin
        sm.cell(gst_r, col).font = font_bold

    pay_r = tot + 2
    sm.cell(pay_r, 2, "PAYABLE (other modules + GST)")
    sm.cell(pay_r, 3, f"=C{tot}+C{gst_r}")
    sm.cell(pay_r, 3).number_format = inr
    for col in range(2, 7):
        sm.cell(pay_r, col).fill = fill_green
        sm.cell(pay_r, col).font = font_white
        sm.cell(pay_r, col).border = thin

    chart = BarChart()
    chart.type = "bar"
    chart.title = "Other modules by workstream (quoted INR, ex-GST)"
    chart.style = 10
    chart.y_axis.numFmt = "₹#,##,##0"
    chart.legend = None
    data = Reference(sm, min_col=3, min_row=4, max_row=tot - 1)
    cats = Reference(sm, min_col=2, min_row=start, max_row=tot - 1)
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    chart.shape = 4
    chart.height = 10
    chart.width = 18
    sm.add_chart(chart, "B" + str(pay_r + 3))

    # ------------------------------------------------------------------ lines
    mods = wb.create_sheet("03 Complete line items")
    mods.page_setup.orientation = "landscape"
    mods.page_setup.fitToPage = True
    mods.page_setup.fitToWidth = 1
    mods.page_margins = PageMargins(0.4, 0.4, 0.6, 0.5)
    mods.freeze_panes = "A5"
    mods.column_dimensions["A"].width = 8
    mods.column_dimensions["B"].width = 44
    mods.column_dimensions["C"].width = 52
    mods.column_dimensions["D"].width = 78
    mods.column_dimensions["E"].width = 10
    mods.column_dimensions["F"].width = 16
    mods.column_dimensions["G"].width = 16

    mods.merge_cells("A1:G1")
    mods["A1"] = "SARVEDA  ·  Every delivered module except native accounting"
    mods["A1"].font = Font(name="Calibri", size=14, bold=True, color=WHITE)
    mods["A1"].fill = fill_green
    mods.merge_cells("A2:G2")
    mods["A2"] = (
        "J1–J13 (GL, GST reports, banking, FIFO, Zoho, etc.) are not in this file. "
        "Edit column F if Accounts negotiates; summary formulas follow."
    )
    mods["A2"].font = font_muted
    mods["A2"].alignment = wrap
    mods.row_dimensions[2].height = 28

    headers = [
        "Code",
        "Workstream",
        "Module",
        "What was delivered",
        "Size",
        "Quoted fee (INR)",
        "Market (INR)",
    ]
    for col, h in enumerate(headers, 1):
        c = mods.cell(4, col, h)
        c.fill = fill_green
        c.font = font_h
        c.alignment = center
        c.border = thin
    mods.row_dimensions[4].height = 22

    data_start = 5
    for i, (code, ws_name, module, delivered, size, quoted, market) in enumerate(rows):
        r = data_start + i
        vals = [code, ws_name, module, delivered, size, quoted, market]
        for col, v in enumerate(vals, 1):
            cell = mods.cell(r, col, v)
            cell.border = thin
            cell.font = font_body
            cell.alignment = left if col in (2, 3, 4) else center
            cell.fill = fill_cream if i % 2 else fill_white
        mods.cell(r, 6).number_format = inr
        mods.cell(r, 6).alignment = right
        mods.cell(r, 6).font = font_bold
        mods.cell(r, 7).number_format = inr
        mods.cell(r, 7).alignment = right
        mods.cell(r, 7).font = font_muted
        mods.row_dimensions[r].height = 34

    data_end = data_start + len(rows) - 1
    tr = data_end + 1
    mods.merge_cells(start_row=tr, start_column=1, end_row=tr, end_column=5)
    mods.cell(tr, 1, "TOTAL other modules (ex-GST) — accounting excluded")
    mods.cell(tr, 1).alignment = Alignment(horizontal="right", vertical="center")
    for col in range(1, 8):
        mods.cell(tr, col).fill = fill_total
        mods.cell(tr, col).font = font_white
        mods.cell(tr, col).border = thin
    mods.cell(tr, 6, f"=SUM(F{data_start}:F{data_end})")
    mods.cell(tr, 6).number_format = inr
    mods.cell(tr, 7, f"=SUM(G{data_start}:G{data_end})")
    mods.cell(tr, 7).number_format = inr
    mods.row_dimensions[tr].height = 24

    gst_row = tr + 1
    mods.merge_cells(start_row=gst_row, start_column=1, end_row=gst_row, end_column=5)
    mods.cell(gst_row, 1, "GST @ 18% on quoted fees")
    mods.cell(gst_row, 1).alignment = Alignment(horizontal="right", vertical="center")
    for col in range(1, 8):
        mods.cell(gst_row, col).fill = fill_amber
        mods.cell(gst_row, col).border = thin
        mods.cell(gst_row, col).font = font_bold
    mods.cell(gst_row, 6, f"=F{tr}*0.18")
    mods.cell(gst_row, 6).number_format = inr

    grand = gst_row + 1
    mods.merge_cells(start_row=grand, start_column=1, end_row=grand, end_column=5)
    mods.cell(grand, 1, "GRAND TOTAL PAYABLE — other modules only")
    mods.cell(grand, 1).alignment = Alignment(horizontal="right", vertical="center")
    for col in range(1, 8):
        mods.cell(grand, col).fill = fill_green
        mods.cell(grand, col).font = font_white
        mods.cell(grand, col).border = thin
    mods.cell(grand, 6, f"=F{tr}+F{gst_row}")
    mods.cell(grand, 6).number_format = inr
    mods.auto_filter.ref = f"A4:G{data_end}"

    wb.calculation.calcMode = "auto"
    wb.calculation.fullCalcOnLoad = True
    wb.save(OUT)
    print(f"Wrote {OUT}")
    print(f"Lines: {len(rows)}")
    print(f"Quoted: {quoted_total}")
    print(f"GST: {gst}")
    print(f"Payable: {payable}")
    for name in order:
        print(f"  {name}: {by_ws[name]['quoted']}  ({by_ws[name]['n']} items)")


if __name__ == "__main__":
    build()
