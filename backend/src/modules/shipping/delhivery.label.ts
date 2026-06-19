import { getSarvedaIconDataUri, getSarvedaLogoDataUri } from "./labelAssets";

export type DelhiveryPackingSlipPackage = {
  wbn?: string;
  oid?: string;
  name?: string;
  address?: string;
  pin?: string | number;
  destination?: string;
  destination_city?: string;
  st?: string;
  customer_state?: string;
  pt?: string;
  prd?: string;
  cod?: number;
  rs?: number;
  weight?: number;
  qty?: string | number;
  barcode?: string;
  oid_barcode?: string;
  delhivery_logo?: string;
  sort_code?: string;
  snm?: string;
  sadd?: string;
  seller_gst_tin?: string;
  client_gst_tin?: string;
  radd?: string;
  cd?: string;
  mot?: string;
  cl?: string;
  [key: string]: unknown;
};

export type LabelLineItem = {
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
};

export type LabelRenderOptions = {
  lineItems?: LabelLineItem[];
  sarvedaLogoDataUri?: string;
};

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInr(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  return amount % 1 === 0 ? String(Math.round(amount)) : amount.toFixed(2);
}

function formatLabelDate(iso: unknown): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  const day = d.getDate();
  const mon = d.toLocaleString("en-IN", { month: "short" });
  const year = d.getFullYear();
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day}-${mon}-${year} | ${hours}:${mins} ${ampm}`;
}

function shippingModeLabel(mot: unknown): string {
  const m = String(mot ?? "S").toUpperCase();
  return m === "E" ? "Express" : "Surface";
}

function paymentLine(pt: unknown, mot: unknown): string {
  const mode = String(pt ?? "Prepaid").toUpperCase();
  const pay = mode === "COD" ? "COD" : "Pre-Paid";
  return `${pay} - ${shippingModeLabel(mot)}`;
}

function truncateAddress(addr: string, max = 95): string {
  const t = addr.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 3)}...`;
}

function resolveLineItems(pkg: DelhiveryPackingSlipPackage, options?: LabelRenderOptions): LabelLineItem[] {
  if (options?.lineItems?.length) return options.lineItems;
  const qty = Number(pkg.qty ?? 1) || 1;
  const total = Number(pkg.cod ?? pkg.rs ?? 0) || 0;
  const unit = qty > 0 ? total / qty : total;
  let name = String(pkg.prd ?? "Product");
  const skuMatch = name.match(/SKU[:\s]*([A-Za-z0-9_-]+)/i);
  const sku = skuMatch?.[1] ?? "";
  name = name.replace(/\(\d+\)\s*$/, "").trim();
  return [{ name, sku, qty, unitPrice: unit, lineTotal: total }];
}

function renderBrandHeader(options?: LabelRenderOptions): string {
  const icon = getSarvedaIconDataUri();
  const lockup = options?.sarvedaLogoDataUri || getSarvedaLogoDataUri();
  if (icon) {
    return `<div class="brand-lockup">
      <img src="${esc(icon)}" alt="" class="brand-icon" />
      <span class="brand-name">Sarveda</span>
    </div>`;
  }
  if (lockup) {
    return `<img src="${esc(lockup)}" alt="Sarveda" class="logo-sarveda" />`;
  }
  return `<span class="brand-name">Sarveda</span>`;
}

function renderProductRows(items: LabelLineItem[]): string {
  return items
    .map(
      (it) => `
      <tr>
        <td class="col-product">
          <div class="product-name">${esc(it.name)}</div>
          ${it.sku ? `<div class="product-sku">SKU:${esc(it.sku)}</div>` : ""}
        </td>
        <td class="col-qty">${esc(it.qty)}</td>
        <td class="col-price">${esc(formatInr(it.unitPrice))}</td>
        <td class="col-total">${esc(formatInr(it.lineTotal))}</td>
      </tr>`
    )
    .join("");
}

function renderSlip(pkg: DelhiveryPackingSlipPackage, options?: LabelRenderOptions): string {
  const delLogo = pkg.delhivery_logo
    ? `<img src="${esc(pkg.delhivery_logo)}" alt="Delhivery" class="logo-del" />`
    : `<span class="logo-del-text">DELHI<span class="logo-del-accent">▪</span>VERY</span>`;
  const sarvedaHeader = renderBrandHeader(options);

  const awb = String(pkg.wbn ?? "");
  const pin = String(pkg.pin ?? "");
  const sortCode = String(pkg.sort_code ?? "");
  const amount = Number(pkg.cod ?? pkg.rs ?? 0) || 0;
  const gst = String(pkg.seller_gst_tin ?? pkg.client_gst_tin ?? "");
  const sellerName = String(pkg.snm ?? "Sarveda");
  const sellerAddr = truncateAddress(String(pkg.sadd ?? ""));
  const returnAddr = String(pkg.radd ?? "").replace(/\s+/g, " ").trim();
  const hub = String(pkg.destination ?? "");
  const lineItems = resolveLineItems(pkg, options);

  const awbBarcode = pkg.barcode
    ? `<img src="${esc(pkg.barcode)}" alt="AWB" class="barcode-main" />`
    : `<div class="barcode-fallback">${esc(awb)}</div>`;
  const oidBarcode = pkg.oid_barcode
    ? `<img src="${esc(pkg.oid_barcode)}" alt="Order" class="barcode-oid" />`
    : "";

  return `
  <section class="slip">
    <header class="head-row">
      ${sarvedaHeader}
      ${delLogo}
    </header>

    <div class="awb-title">AWB# ${esc(awb)}</div>
    <div class="barcode-wrap">${awbBarcode}</div>
    <div class="awb-meta">
      <span>${esc(pin)}</span>
      <span class="awb-meta-center">AWB# ${esc(awb)}</span>
      <span class="awb-meta-right">${esc(sortCode)}</span>
    </div>

    <div class="section ship-block">
      <div class="ship-left">
        <div class="ship-to">Ship to - <strong>${esc(pkg.name)}</strong></div>
        <div class="addr">${esc(pkg.address)}</div>
        <div class="hub"><strong>${esc(hub)}</strong></div>
        <div class="pin"><strong>PIN - ${esc(pin)}</strong></div>
      </div>
      <div class="ship-right">
        <div class="pay-mode">${esc(paymentLine(pkg.pt, pkg.mot))}</div>
        <div class="amount"><strong>INR ${esc(formatInr(amount))}</strong></div>
        <div class="date-row">
          <span class="date-label">Date</span>
          <span class="date-val">${esc(formatLabelDate(pkg.cd))}</span>
        </div>
      </div>
    </div>

    <div class="section seller-block">
      <div class="seller-left">
        <div>Seller:<strong>${esc(sellerName)}</strong></div>
        <div class="seller-addr">${esc(sellerAddr)}</div>
        ${gst ? `<div class="gst">GST: ${esc(gst)}</div>` : ""}
      </div>
      <div class="seller-right">
        <div class="oid">${esc(pkg.oid)}</div>
        ${oidBarcode}
      </div>
    </div>

    <table class="products">
      <thead>
        <tr>
          <th>Product Name &amp; SKU</th>
          <th>Qty.</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${renderProductRows(lineItems)}</tbody>
    </table>

    <footer class="foot">
      <div class="return">Return Address: ${esc(returnAddr)}</div>
      <div class="page-no">Page 1 of 1</div>
    </footer>
  </section>`;
}

export function renderDelhiveryPackingSlipHtml(
  packages: DelhiveryPackingSlipPackage[],
  options?: LabelRenderOptions
): string {
  const logoUri = options?.sarvedaLogoDataUri || getSarvedaLogoDataUri();
  const slips = packages.map((pkg) => renderSlip(pkg, { ...options, sarvedaLogoDataUri: logoUri })).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sarveda shipping label</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: 105mm 148mm; margin: 0; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      background: #e5e7eb;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      padding: 10px 14px;
      background: #1e3a2f;
      color: #fff;
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .toolbar button {
      background: #fbbf24;
      color: #111;
      border: 0;
      border-radius: 6px;
      padding: 7px 14px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
    }
    .wrap { padding: 12px; display: flex; justify-content: center; }
    .slip {
      width: 105mm;
      min-height: 148mm;
      background: #fff;
      border: 1px solid #111;
      padding: 3mm 3.5mm 2.5mm;
      font-size: 8.5px;
      line-height: 1.35;
      page-break-after: always;
    }
    .head-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2mm;
    }
    .brand-lockup { display: flex; align-items: center; gap: 1.5mm; }
    .brand-icon { height: 7mm; width: auto; }
    .brand-name { font-size: 15px; font-weight: 700; color: #8b6914; letter-spacing: 0.01em; }
    .logo-sarveda { height: 11mm; max-width: 42mm; object-fit: contain; object-position: left; }
    .logo-del { height: 7mm; max-width: 28mm; object-fit: contain; }
    .logo-del-text { font-size: 11px; font-weight: 900; letter-spacing: 0.06em; }
    .logo-del-accent { color: #e11; font-size: 8px; vertical-align: super; }
    .awb-title { font-size: 9px; margin-bottom: 1mm; }
    .barcode-wrap { text-align: center; margin: 0.5mm 0; }
    .barcode-main { width: 100%; max-height: 14mm; object-fit: contain; }
    .barcode-oid { width: 22mm; max-height: 8mm; object-fit: contain; display: block; margin-top: 1mm; }
    .barcode-fallback { font-family: monospace; font-size: 14px; font-weight: 700; text-align: center; }
    .awb-meta {
      display: grid;
      grid-template-columns: 1fr 1.4fr 1fr;
      font-size: 8px;
      margin-bottom: 2mm;
      padding-bottom: 1.5mm;
      border-bottom: 1px solid #111;
    }
    .awb-meta-center { text-align: center; }
    .awb-meta-right { text-align: right; }
    .section { border-bottom: 1px solid #111; padding: 2mm 0; }
    .ship-block { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 2mm; }
    .ship-to { margin-bottom: 1mm; }
    .addr, .hub { margin-bottom: 0.5mm; word-break: break-word; }
    .pin { margin-top: 1mm; }
    .ship-right { text-align: left; }
    .pay-mode { margin-bottom: 1.5mm; font-size: 9px; }
    .amount { font-size: 14px; margin-bottom: 2mm; }
    .date-row { font-size: 8px; }
    .date-label { display: block; color: #333; margin-bottom: 0.5mm; }
    .seller-block { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 2mm; align-items: start; }
    .seller-addr { margin: 1mm 0; word-break: break-word; font-size: 8px; }
    .gst { font-size: 8px; }
    .seller-right { text-align: right; }
    .oid { font-size: 11px; font-weight: 700; margin-bottom: 0.5mm; }
    .products {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1.5mm;
      font-size: 8px;
    }
    .products th {
      text-align: left;
      font-weight: 700;
      padding: 1mm 1mm 1.5mm;
      border-bottom: 1px solid #111;
      font-size: 7.5px;
    }
    .products td { padding: 1.2mm 1mm; vertical-align: top; border-bottom: 1px solid #ddd; }
    .col-qty, .col-price, .col-total { width: 12mm; text-align: right; white-space: nowrap; }
    .col-product { width: auto; }
    .product-name { font-weight: 600; margin-bottom: 0.5mm; word-break: break-word; }
    .product-sku { font-size: 7.5px; color: #333; }
    .foot {
      display: flex;
      justify-content: space-between;
      gap: 3mm;
      margin-top: 2mm;
      font-size: 7.5px;
      align-items: flex-end;
    }
    .return { flex: 1; word-break: break-word; line-height: 1.3; }
    .page-no { white-space: nowrap; font-size: 7.5px; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .wrap { padding: 0; }
      .slip { border: 1px solid #111; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Sarveda × Delhivery shipping label</strong>
    <button type="button" onclick="window.print()">Print label</button>
  </div>
  <div class="wrap">${slips}</div>
</body>
</html>`;
}
