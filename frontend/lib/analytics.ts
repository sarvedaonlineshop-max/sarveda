declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

type PurchaseItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

/** Tracking is best-effort: it must never break checkout or the order page. */
function safe(run: () => void): void {
  if (typeof window === "undefined") return;
  try {
    run();
  } catch {
    /* ignore analytics failures */
  }
}

function toMajor(minorUnits: number): number {
  return Math.round(Number(minorUnits) || 0) / 100;
}

/** ISO 4217 currency for Meta / GA — letters only, uppercase (e.g. INR, USD). */
function normalizeCurrency(raw: string | undefined): string {
  const cleaned = String(raw || "INR")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return cleaned || "INR";
}

/** Meta requires a plain number > 0 (no currency symbols, not a string). */
function metaMoneyValue(minorUnits: number): number | null {
  const major = toMajor(minorUnits);
  if (!Number.isFinite(major) || !(major > 0)) return null;
  return Number(major.toFixed(2));
}

function ga4Items(items: PurchaseItem[]) {
  return items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    quantity: i.quantity,
    price: toMajor(i.price)
  }));
}

function metaContents(items: PurchaseItem[]) {
  return items.map((i) => ({
    id: i.id,
    quantity: i.quantity,
    item_price: toMajor(i.price)
  }));
}

/** Meta / Ads tags configured in GTM read value + currency from this event. */
function pushDataLayer(event: string, ecommerce: Record<string, unknown>): void {
  if (!Array.isArray(window.dataLayer)) window.dataLayer = [];
  window.dataLayer.push({ ecommerce: null });
  window.dataLayer.push({ event, ecommerce });
}

/**
 * Order-confirmed often finishes before Next.js injects the Meta snippet.
 * Queue until fbq exists (the official stub also queues until fbevents.js loads).
 */
function whenFbqReady(run: (fbq: NonNullable<Window["fbq"]>) => void): void {
  safe(() => {
    const started = Date.now();
    const tryRun = () => {
      if (typeof window.fbq === "function") {
        run(window.fbq);
        return;
      }
      if (Date.now() - started > 8000) return;
      window.setTimeout(tryRun, 50);
    };
    tryRun();
  });
}

function trackMeta(
  event: "Purchase" | "AddToCart" | "InitiateCheckout",
  payload: Record<string, unknown>,
  eventId?: string
): void {
  whenFbqReady((fbq) => {
    if (eventId) {
      fbq("track", event, payload, { eventID: eventId });
    } else {
      fbq("track", event, payload);
    }
  });
}

export function trackPurchase(params: {
  orderId: string;
  value: number;
  currency: string;
  items: PurchaseItem[];
}): void {
  safe(() => {
    const value = metaMoneyValue(params.value);
    if (value == null) return;
    const currency = normalizeCurrency(params.currency);
    const items = params.items ?? [];
    const eventId = `purchase_${params.orderId}`.slice(0, 64);

    pushDataLayer("purchase", {
      transaction_id: params.orderId,
      currency,
      value,
      items: ga4Items(items)
    });

    if (window.gtag) {
      window.gtag("event", "purchase", {
        transaction_id: params.orderId,
        value,
        currency,
        items: ga4Items(items)
      });
    }

    // Minimal required fields first — Meta Events Manager diagnostics key off these.
    trackMeta(
      "Purchase",
      {
        value,
        currency,
        content_ids: items.map((i) => i.id),
        contents: metaContents(items),
        content_type: "product",
        num_items: items.reduce((s, i) => s + i.quantity, 0)
      },
      eventId
    );
  });
}

export function trackAddToCart(params: {
  itemId: string;
  name: string;
  value: number;
  currency: string;
  quantity?: number;
}): void {
  safe(() => {
    const value = metaMoneyValue(params.value);
    if (value == null) return;
    const currency = normalizeCurrency(params.currency);
    const quantity = params.quantity && params.quantity > 0 ? params.quantity : 1;
    const item: PurchaseItem = {
      id: params.itemId,
      name: params.name,
      quantity,
      price: params.value / quantity
    };

    pushDataLayer("add_to_cart", {
      currency,
      value,
      items: ga4Items([item])
    });

    if (window.gtag) {
      window.gtag("event", "add_to_cart", {
        currency,
        value,
        items: ga4Items([item])
      });
    }

    trackMeta("AddToCart", {
      content_ids: [params.itemId],
      content_name: params.name,
      contents: metaContents([item]),
      content_type: "product",
      value,
      currency
    });
  });
}

export function trackInitiateCheckout(params: {
  value: number;
  currency: string;
  items?: PurchaseItem[];
}): void {
  safe(() => {
    const value = metaMoneyValue(params.value);
    if (value == null) return;
    const currency = normalizeCurrency(params.currency);
    const items = params.items ?? [];

    pushDataLayer("begin_checkout", {
      currency,
      value,
      items: ga4Items(items)
    });

    if (window.gtag) {
      window.gtag("event", "begin_checkout", {
        currency,
        value,
        items: ga4Items(items)
      });
    }

    trackMeta("InitiateCheckout", {
      value,
      currency,
      content_ids: items.map((i) => i.id),
      contents: metaContents(items),
      content_type: "product",
      num_items: items.reduce((s, i) => s + i.quantity, 0)
    });
  });
}
