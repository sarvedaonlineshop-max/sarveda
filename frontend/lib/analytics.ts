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
  return Math.round(minorUnits) / 100;
}

/** ISO 4217 currency for Meta / GA — letters only, uppercase (e.g. INR, USD). */
function normalizeCurrency(raw: string | undefined): string {
  const cleaned = (raw || "INR").trim().toUpperCase().replace(/[^A-Z]/g, "");
  return cleaned || "INR";
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

export function trackPurchase(params: {
  orderId: string;
  value: number;
  currency: string;
  items: PurchaseItem[];
}): void {
  safe(() => {
    // Meta Events Manager requires numeric value > 0 and ISO currency (no symbols).
    const value = toMajor(params.value);
    if (!(value > 0)) return;
    const currency = (params.currency || "INR").trim().toUpperCase().replace(/[^A-Z]/g, "") || "INR";
    const items = params.items ?? [];

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

    if (window.fbq) {
      window.fbq("track", "Purchase", {
        value,
        currency,
        content_ids: items.map((i) => i.id),
        contents: metaContents(items),
        content_type: "product",
        num_items: items.reduce((s, i) => s + i.quantity, 0)
      });
    }
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
    const value = toMajor(params.value);
    const quantity = params.quantity && params.quantity > 0 ? params.quantity : 1;
    const item: PurchaseItem = {
      id: params.itemId,
      name: params.name,
      quantity,
      price: params.value / quantity
    };

    pushDataLayer("add_to_cart", {
      currency: params.currency,
      value,
      items: ga4Items([item])
    });

    if (window.gtag) {
      window.gtag("event", "add_to_cart", {
        currency: params.currency,
        value,
        items: ga4Items([item])
      });
    }

    if (window.fbq) {
      window.fbq("track", "AddToCart", {
        content_ids: [params.itemId],
        content_name: params.name,
        contents: metaContents([item]),
        content_type: "product",
        value,
        currency: params.currency
      });
    }
  });
}

export function trackInitiateCheckout(params: {
  value: number;
  currency: string;
  items?: PurchaseItem[];
}): void {
  safe(() => {
    const value = toMajor(params.value);
    const items = params.items ?? [];

    pushDataLayer("begin_checkout", {
      currency: params.currency,
      value,
      items: ga4Items(items)
    });

    if (window.gtag) {
      window.gtag("event", "begin_checkout", {
        currency: params.currency,
        value,
        items: ga4Items(items)
      });
    }

    if (window.fbq) {
      window.fbq("track", "InitiateCheckout", {
        value,
        currency: params.currency,
        content_ids: items.map((i) => i.id),
        contents: metaContents(items),
        content_type: "product",
        num_items: items.reduce((s, i) => s + i.quantity, 0)
      });
    }
  });
}
