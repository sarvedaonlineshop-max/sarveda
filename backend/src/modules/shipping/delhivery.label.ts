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
  weight?: number;
  barcode?: string;
  delhivery_logo?: string;
  cl?: string;
  cd?: string;
  [key: string]: unknown;
};

function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderDelhiveryPackingSlipHtml(packages: DelhiveryPackingSlipPackage[]): string {
  const slips = packages
    .map((pkg) => {
      const logo = pkg.delhivery_logo
        ? `<img src="${esc(pkg.delhivery_logo)}" alt="Delhivery" style="height:28px" />`
        : `<strong style="font-size:18px">Delhivery</strong>`;
      const barcode = pkg.barcode
        ? `<img src="${esc(pkg.barcode)}" alt="AWB ${esc(pkg.wbn)}" style="max-width:100%;height:72px" />`
        : `<div style="font-family:monospace;font-size:22px;font-weight:700">${esc(pkg.wbn)}</div>`;

      return `
      <section class="slip">
        <header>
          ${logo}
          <div class="awb">${esc(pkg.wbn)}</div>
        </header>
        <div class="barcode">${barcode}</div>
        <div class="grid">
          <div>
            <h3>Ship To</h3>
            <p><strong>${esc(pkg.name)}</strong></p>
            <p>${esc(pkg.address)}</p>
            <p>${esc(pkg.destination_city || pkg.destination)} ${esc(pkg.pin)}</p>
            <p>${esc(pkg.customer_state || pkg.st)}</p>
          </div>
          <div>
            <h3>Shipment</h3>
            <p><span>Order</span> ${esc(pkg.oid)}</p>
            <p><span>Payment</span> ${esc(pkg.pt)}</p>
            <p><span>Product</span> ${esc(pkg.prd)}</p>
            <p><span>Weight</span> ${esc(pkg.weight)} g</p>
            ${pkg.cod ? `<p><span>COD</span> ₹${esc(pkg.cod)}</p>` : ""}
            <p><span>Created</span> ${esc(pkg.cd)}</p>
          </div>
        </div>
        <footer>${esc(pkg.cl)}</footer>
      </section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Delhivery label</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #f3f4f6; }
    .toolbar { padding: 12px 16px; background: #1e3a2f; color: #fff; display: flex; gap: 12px; align-items: center; }
    .toolbar button { background: #fbbf24; color: #111; border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
    .wrap { padding: 16px; }
    .slip { background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; max-width: 520px; margin: 0 auto 16px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .awb { font-family: monospace; font-size: 20px; font-weight: 700; }
    .barcode { text-align: center; margin: 8px 0 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px; line-height: 1.45; }
    h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
    p { margin: 0 0 4px; }
    span { color: #6b7280; }
    footer { margin-top: 12px; font-size: 11px; color: #6b7280; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .wrap { padding: 0; }
      .slip { border: 0; border-radius: 0; max-width: none; margin: 0; page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>Delhivery shipping label</strong>
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <div class="wrap">${slips}</div>
</body>
</html>`;
}
