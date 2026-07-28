import { parse } from "csv-parse/sync";

import { marketplaceChannelCodeSchema } from "../marketplaces.schemas";

type ChannelCode = typeof marketplaceChannelCodeSchema._type;

type ImportRow = {
  externalOrderId: string;
  orderDate: string;
  sku: string;
  quantity: number;
  unitPriceInPaise: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  shipToCountry: string | null;
  shipToPostalCode: string | null;
  productName: string | null;
  notes: string | null;
};

type HeaderMap = Record<keyof Omit<ImportRow, "quantity" | "unitPriceInPaise"> | "quantity" | "unitPriceInPaise", string[]>;

const HEADER_MAPS: Record<ChannelCode, HeaderMap> = {
  AMAZON: {
    externalOrderId: ["amazon-order-id", "order id", "order-id", "order number", "order_number"],
    orderDate: ["purchase-date", "order date", "purchase date", "order_date", "date"],
    sku: ["sku", "seller-sku", "merchant-sku", "msku"],
    quantity: ["quantity", "qty", "units"],
    unitPriceInPaise: ["item-price", "unit price", "price", "amount"],
    customerName: ["recipient-name", "customer name", "buyer-name", "buyer name"],
    customerEmail: ["buyer-email", "customer email", "email"],
    customerPhone: ["phone", "customer phone", "recipient-phone"],
    shipToCity: ["ship-city", "city"],
    shipToState: ["ship-state", "state"],
    shipToCountry: ["ship-country", "country"],
    shipToPostalCode: ["ship-postal-code", "pincode", "postal code", "zip"],
    productName: ["product-name", "title", "product name"],
    notes: ["notes", "remark", "remarks"]
  },
  FLIPKART: {
    externalOrderId: ["order id", "order_id", "fsn order id", "flipkart order id"],
    orderDate: ["order date", "dispatch by date", "approved date", "date"],
    sku: ["sku", "seller sku", "fsn", "listing id"],
    quantity: ["quantity", "qty", "units"],
    unitPriceInPaise: ["selling price", "price", "amount"],
    customerName: ["customer name", "buyer name"],
    customerEmail: ["email", "customer email"],
    customerPhone: ["phone", "mobile", "customer phone"],
    shipToCity: ["city", "ship city"],
    shipToState: ["state", "ship state"],
    shipToCountry: ["country"],
    shipToPostalCode: ["pincode", "postal code"],
    productName: ["product title", "product name", "title"],
    notes: ["notes", "remarks"]
  },
  ETSY: {
    externalOrderId: ["sale id", "order id", "receipt id"],
    orderDate: ["sale date", "date", "created date"],
    sku: ["sku", "variation sku"],
    quantity: ["quantity", "qty"],
    unitPriceInPaise: ["price", "item price", "order value"],
    customerName: ["name", "buyer name", "full name"],
    customerEmail: ["email", "buyer email"],
    customerPhone: ["phone"],
    shipToCity: ["ship city", "city"],
    shipToState: ["ship state", "state"],
    shipToCountry: ["ship country", "country"],
    shipToPostalCode: ["ship zip", "postal code", "zip"],
    productName: ["title", "product name"],
    notes: ["notes", "message"]
  },
  AMALA: {
    externalOrderId: ["order id", "order number", "order_no"],
    orderDate: ["order date", "date", "created at"],
    sku: ["sku", "seller sku", "item sku"],
    quantity: ["quantity", "qty", "units"],
    unitPriceInPaise: ["price", "item price", "amount"],
    customerName: ["customer name", "name"],
    customerEmail: ["email"],
    customerPhone: ["phone", "mobile"],
    shipToCity: ["city"],
    shipToState: ["state"],
    shipToCountry: ["country"],
    shipToPostalCode: ["postal code", "pincode"],
    productName: ["product name", "title"],
    notes: ["notes", "remarks"]
  },
  FIRSTCRY: {
    externalOrderId: ["order id", "order number", "suborder id"],
    orderDate: ["order date", "date"],
    sku: ["sku", "supplier sku", "seller sku"],
    quantity: ["quantity", "qty"],
    unitPriceInPaise: ["price", "item amount", "amount"],
    customerName: ["customer name", "name"],
    customerEmail: ["email"],
    customerPhone: ["phone", "mobile"],
    shipToCity: ["city"],
    shipToState: ["state"],
    shipToCountry: ["country"],
    shipToPostalCode: ["pincode", "postal code"],
    productName: ["product name", "title"],
    notes: ["notes", "remarks"]
  },
  TATA_1MG: {
    externalOrderId: ["order id", "order number", "order_no"],
    orderDate: ["order date", "date", "created at"],
    sku: ["sku", "partner sku", "seller sku"],
    quantity: ["quantity", "qty", "units"],
    unitPriceInPaise: ["price", "amount", "item amount"],
    customerName: ["customer name", "name"],
    customerEmail: ["email"],
    customerPhone: ["phone", "mobile"],
    shipToCity: ["city"],
    shipToState: ["state"],
    shipToCountry: ["country"],
    shipToPostalCode: ["pincode", "postal code"],
    productName: ["product name", "title"],
    notes: ["notes", "remarks"]
  },
  SARVEDA: {
    externalOrderId: ["order id", "order number"],
    orderDate: ["order date", "date"],
    sku: ["sku"],
    quantity: ["quantity", "qty"],
    unitPriceInPaise: ["price", "amount"],
    customerName: ["customer name", "name"],
    customerEmail: ["email"],
    customerPhone: ["phone"],
    shipToCity: ["city"],
    shipToState: ["state"],
    shipToCountry: ["country"],
    shipToPostalCode: ["pincode", "postal code"],
    productName: ["product name", "title"],
    notes: ["notes", "remarks"]
  }
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function getByAliases(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return "";
}

function toPaise(raw: string): number | null {
  const trimmed = raw.replace(/[,\s₹]/g, "").trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function toQty(raw: string): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 1;
  return Math.max(1, Math.floor(num));
}

export function parseMarketplaceOrdersCsv(channelCode: ChannelCode, csvText: string): ImportRow[] {
  const records = parse(csvText, {
    columns: (header: string[]) => header.map((h) => normalizeHeader(h)),
    skip_empty_lines: true,
    bom: true,
    trim: true
  }) as Array<Record<string, string>>;

  const headerMap = HEADER_MAPS[channelCode];
  return records
    .map((row) => ({
      externalOrderId: getByAliases(row, headerMap.externalOrderId),
      orderDate: getByAliases(row, headerMap.orderDate),
      sku: getByAliases(row, headerMap.sku),
      quantity: toQty(getByAliases(row, headerMap.quantity)),
      unitPriceInPaise: toPaise(getByAliases(row, headerMap.unitPriceInPaise)),
      customerName: getByAliases(row, headerMap.customerName) || null,
      customerEmail: getByAliases(row, headerMap.customerEmail) || null,
      customerPhone: getByAliases(row, headerMap.customerPhone) || null,
      shipToCity: getByAliases(row, headerMap.shipToCity) || null,
      shipToState: getByAliases(row, headerMap.shipToState) || null,
      shipToCountry: getByAliases(row, headerMap.shipToCountry) || null,
      shipToPostalCode: getByAliases(row, headerMap.shipToPostalCode) || null,
      productName: getByAliases(row, headerMap.productName) || null,
      notes: getByAliases(row, headerMap.notes) || null
    }))
    .filter((row) => row.externalOrderId && row.orderDate && row.sku);
}
