declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

type PurchaseItem = {
  id: string;
  name: string;
  quantity: number;
  price: number;
};

export function trackPurchase(params: {
  orderId: string;
  value: number;
  currency: string;
  items: PurchaseItem[];
}): void {
  if (typeof window === "undefined") return;

  if (window.gtag) {
    window.gtag("event", "purchase", {
      transaction_id: params.orderId,
      value: params.value / 100,
      currency: params.currency,
      items: params.items.map((i) => ({
        item_id: i.id,
        item_name: i.name,
        quantity: i.quantity,
        price: i.price / 100
      }))
    });
  }

  if (window.fbq) {
    window.fbq("track", "Purchase", {
      value: params.value / 100,
      currency: params.currency,
      content_ids: params.items.map((i) => i.id),
      content_type: "product"
    });
  }
}

export function trackAddToCart(params: {
  itemId: string;
  name: string;
  value: number;
  currency: string;
}): void {
  if (typeof window === "undefined") return;

  if (window.gtag) {
    window.gtag("event", "add_to_cart", {
      currency: params.currency,
      value: params.value / 100,
      items: [{ item_id: params.itemId, item_name: params.name }]
    });
  }

  if (window.fbq) {
    window.fbq("track", "AddToCart", {
      content_ids: [params.itemId],
      content_name: params.name,
      value: params.value / 100,
      currency: params.currency
    });
  }
}

export function trackInitiateCheckout(value: number, currency: string): void {
  if (typeof window === "undefined") return;

  if (window.gtag) {
    window.gtag("event", "begin_checkout", {
      currency,
      value: value / 100
    });
  }

  if (window.fbq) {
    window.fbq("track", "InitiateCheckout");
  }
}
