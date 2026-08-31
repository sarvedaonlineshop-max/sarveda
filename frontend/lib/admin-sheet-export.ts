/** Client-side CSV / Excel (SpreadsheetML) exports for admin sheets. */

function escapeCsvCell(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function escapeXml(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsvFile(filename: string, content: string): void {
  downloadTextFile(filename, content, "text/csv;charset=utf-8");
}

export function downloadExcelXmlFile(filename: string, xml: string): void {
  downloadTextFile(filename, xml, "application/vnd.ms-excel");
}

function sheetXml(headers: string[], rows: Array<Array<string | number>>): string {
  const cell = (v: string | number) =>
    `<Cell><Data ss:Type="${typeof v === "number" ? "Number" : "String"}">${escapeXml(v)}</Data></Cell>`;
  const headerRow = `<Row>${headers.map((h) => cell(h)).join("")}</Row>`;
  const dataRows = rows.map((r) => `<Row>${r.map((c) => cell(c)).join("")}</Row>`).join("");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Sheet1"><Table>${headerRow}${dataRows}</Table></Worksheet>
</Workbook>`;
}

export type ProductsExportRow = {
  productName: string;
  variantName: string;
  sku: string;
  qty: number;
  mrpInPaise: number;
  saleInPaise: number;
  mrpUsdCents: number | null;
  saleUsdCents: number | null;
  mrpGbpPence: number | null;
  saleGbpPence: number | null;
  hsnCode: string;
  gstPercent: number;
  productStatus: string;
  variantStatus: string;
};

export function productsSheetToCsv(rows: ProductsExportRow[]): string {
  const header = [
    "Product",
    "Variant",
    "SKU",
    "Qty",
    "MRP INR",
    "Sale INR",
    "MRP USD",
    "Sale USD",
    "MRP GBP",
    "Sale GBP",
    "HSN",
    "GST %",
    "Product status",
    "Variant status"
  ];
  const minor = (n: number | null) => (n == null ? "" : (n / 100).toFixed(2));
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.productName),
        escapeCsvCell(r.variantName),
        escapeCsvCell(r.sku),
        r.qty,
        minor(r.mrpInPaise),
        minor(r.saleInPaise),
        minor(r.mrpUsdCents),
        minor(r.saleUsdCents),
        minor(r.mrpGbpPence),
        minor(r.saleGbpPence),
        escapeCsvCell(r.hsnCode),
        r.gstPercent,
        escapeCsvCell(r.productStatus),
        escapeCsvCell(r.variantStatus)
      ].join(",")
    )
  ];
  return lines.join("\n");
}

export function productsSheetToExcelXml(rows: ProductsExportRow[]): string {
  const headers = [
    "Product",
    "Variant",
    "SKU",
    "Qty",
    "MRP INR",
    "Sale INR",
    "MRP USD",
    "Sale USD",
    "MRP GBP",
    "Sale GBP",
    "HSN",
    "GST %",
    "Product status",
    "Variant status"
  ];
  const minor = (n: number | null) => (n == null ? "" : n / 100);
  return sheetXml(
    headers,
    rows.map((r) => [
      r.productName,
      r.variantName,
      r.sku,
      r.qty,
      minor(r.mrpInPaise),
      minor(r.saleInPaise),
      minor(r.mrpUsdCents),
      minor(r.saleUsdCents),
      minor(r.mrpGbpPence),
      minor(r.saleGbpPence),
      r.hsnCode,
      r.gstPercent,
      r.productStatus,
      r.variantStatus
    ])
  );
}

export type InventoryExportRow = {
  sku: string;
  productName: string;
  variantLabel: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  stockStatus: string;
};

export function inventorySheetToCsv(rows: InventoryExportRow[]): string {
  const header = [
    "SKU",
    "Product",
    "Variant",
    "On hand",
    "Reserved",
    "Available",
    "Low stock threshold",
    "Stock status"
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.sku),
        escapeCsvCell(r.productName),
        escapeCsvCell(r.variantLabel),
        r.onHand,
        r.reserved,
        r.available,
        r.lowStockThreshold,
        escapeCsvCell(r.stockStatus)
      ].join(",")
    )
  ];
  return lines.join("\n");
}

export function inventorySheetToExcelXml(rows: InventoryExportRow[]): string {
  return sheetXml(
    ["SKU", "Product", "Variant", "On hand", "Reserved", "Available", "Low stock threshold", "Stock status"],
    rows.map((r) => [
      r.sku,
      r.productName,
      r.variantLabel,
      r.onHand,
      r.reserved,
      r.available,
      r.lowStockThreshold,
      r.stockStatus
    ])
  );
}
