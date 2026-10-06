/**
 * Pure nginx access-log summary for the Servers admin page.
 * Shopper identity uses the trailing `cf=` field (Cloudflare connecting IP).
 * The first IP on the line is Cloudflare's edge and is not a person.
 */

export type Shopper404 = { path: string; count: number };

export type TrafficSummary = {
  people: number | null;
  storefrontPeople: number | null;
  storefrontPageLoads: number;
  shopperHtml404: number;
  shopperFailedPeople: number | null;
  /** Requests that could not reach the shop or the API (502–504). Picture errors are not included. */
  serverErrors: number;
  /** Separate stops, grouped when unreachable requests are a few minutes apart. */
  shopOutages: number;
  scanner404: number;
  linesWithClientIp: number;
  topShopper404: Shopper404[];
};

const STATIC_EXT =
  /\.(?:css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|mp3|mp4|webm|json|xml|txt)$/i;

export function startOfTodayIstUtc(now = new Date()): Date {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 60 * 60 * 1000);
}

export function parseNginxTime(raw: string): Date | null {
  const head = raw.split(" ")[0] ?? "";
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})$/.exec(head);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months.indexOf(m[2] ?? "");
  if (month < 0) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6])));
}

const LINE =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^" ]*) HTTP\/[^"]*" (\d+) (\S+) "([^"]*)" "([^"]*)"(?: cf=(\S+))?/;

export function isScanner(ua: string, path: string): boolean {
  const u = ua.toLowerCase();
  const p = path.toLowerCase();
  if (
    ["bot", "spider", "crawler", "facebookexternalhit", "googlebot", "bingbot", "bytespider", "ahrefs", "semrush", "petal", "headless", "wget", "curl", "python", "preview"].some(
      (x) => u.includes(x)
    )
  ) {
    return true;
  }
  return [
    "wp-",
    "xmlrpc",
    ".php",
    ".env",
    ".git",
    "wlwmanifest",
    "apple-touch",
    "favicon",
    "meta.json",
    "llms.txt",
    "well-known",
    "cart.js",
    "readme.html",
    "cgi-bin",
    "wp-json",
    "/feed"
  ].some((x) => p.includes(x));
}

function clientIp(cf: string | undefined): string | null {
  if (!cf || cf === "-") return null;
  if (!/^[0-9a-fA-F:.]+$/.test(cf)) return null;
  return cf;
}

/** Unreachable requests more than ten minutes apart count as another stop. */
function countOutages(times: number[]): number {
  if (times.length === 0) return 0;
  const sorted = [...times].sort((a, b) => a - b);
  let outages = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]! - sorted[i - 1]! > 10 * 60 * 1000) outages += 1;
  }
  return outages;
}

function isStorefrontPage(method: string, path: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  const p = path.split("?")[0] ?? path;
  if (p.startsWith("/admin") || p.startsWith("/api") || p.startsWith("/_next")) return false;
  if (STATIC_EXT.test(p)) return false;
  return true;
}

export function summarizeAccessLines(lines: Iterable<string>, start: Date): TrafficSummary {
  const people = new Set<string>();
  const storefrontPeople = new Set<string>();
  const failedPeople = new Set<string>();
  const shopper404 = new Map<string, number>();
  let storefrontPageLoads = 0;
  let shopperHtml404 = 0;
  let serverErrors = 0;
  const unreachableAt: number[] = [];
  let scanner404 = 0;
  let linesWithClientIp = 0;
  let sawClientIp = false;

  for (const line of lines) {
    const m = LINE.exec(line);
    if (!m) continue;
    const when = parseNginxTime(m[2] ?? "");
    if (!when || when < start) continue;
    const method = m[3] ?? "";
    const url = m[4] ?? "";
    const status = Number(m[5]);
    const size = Number(m[6]);
    const ua = m[8] ?? "";
    const path = url.split("?")[0] ?? url;
    const ip = clientIp(m[9]);
    if (ip) {
      sawClientIp = true;
      linesWithClientIp += 1;
    }
    const scanner = isScanner(ua, path);
    const browser = ua.toLowerCase().includes("mozilla") && !scanner;

    if (status === 404 && scanner) scanner404 += 1;
    // 502–504: nginx could not reach the shop or the API, so the client got nothing.
    // 500 is the process answering with an error (for example a slow old photo) and is not a stop.
    if (status === 502 || status === 503 || status === 504) {
      serverErrors += 1;
      unreachableAt.push(when.getTime());
    }

    if (browser && ip) people.add(ip);

    if (browser && isStorefrontPage(method, path)) {
      storefrontPageLoads += 1;
      if (ip) storefrontPeople.add(ip);
    }

    const shopperMissingPage = status === 404 && browser && Number.isFinite(size) && size >= 2000;
    const shopperServerError = (status === 502 || status === 503 || status === 504) && browser;
    if (shopperMissingPage) {
      shopperHtml404 += 1;
      shopper404.set(path, (shopper404.get(path) ?? 0) + 1);
    }
    if ((shopperMissingPage || shopperServerError) && ip) failedPeople.add(ip);
  }

  const topShopper404 = [...shopper404.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([path, count]) => ({ path, count }));

  return {
    people: sawClientIp ? people.size : null,
    storefrontPeople: sawClientIp ? storefrontPeople.size : null,
    storefrontPageLoads,
    shopperHtml404,
    shopperFailedPeople: sawClientIp ? failedPeople.size : null,
    serverErrors,
    shopOutages: countOutages(unreachableAt),
    scanner404,
    linesWithClientIp,
    topShopper404
  };
}

export type PeopleVisit = {
  ip: string;
  utm: string | null;
  pages: string[];
};

export type StorefrontVisit = {
  ip: string;
  utm: string | null;
  firstAt: string;
  lastAt: string;
  products: string[];
  productCount: number;
  /** Page areas from the log: Home, Store, Product, and the rest. Not product names. */
  pages: string[];
  /** Product pages they were on when Add to cart succeeded. */
  cartProducts: string[];
  addedToCart: boolean;
  checkout: boolean;
  bought: boolean;
  /** human = paced browsing. bot = catalog walk or a crawler browser name. */
  audience: "human" | "bot";
  note: string | null;
};

export type MissingPageHit = {
  path: string;
  utm: string | null;
  at: string;
};

export type ShopOutage = {
  from: string;
  to: string;
  requests: number;
  reason: string;
};

export type AccessDetail = {
  people: PeopleVisit[];
  storefront: StorefrontVisit[];
  missing: MissingPageHit[];
  outages: ShopOutage[];
};

const PAGE_AREAS: Array<[string, (path: string) => boolean]> = [
  ["Home", (path) => path === "/"],
  ["Store", (path) => path === "/store" || path === "/shop" || path.startsWith("/store/") || path.startsWith("/shop/") || path.startsWith("/product-category") || path.startsWith("/search")],
  ["Product", (path) => path.startsWith("/product/")],
  ["Cart", (path) => path === "/cart" || path.startsWith("/cart/")],
  ["Checkout", (path) => path === "/checkout" || path.startsWith("/checkout/")],
  ["Course", (path) => path.startsWith("/course")],
  ["Event", (path) => path.startsWith("/event")],
  ["Retreat", (path) => path.startsWith("/retreat")],
  ["Admin", (path) => path.startsWith("/admin")]
];

function pageArea(path: string): string | null {
  if (path.startsWith("/api") || path.startsWith("/_next") || STATIC_EXT.test(path)) return null;
  for (const [name, match] of PAGE_AREAS) {
    if (match(path)) return name;
  }
  return "Other page";
}

function utmLabel(url: string): string | null {
  const q = url.split("?")[1];
  if (!q) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(q);
  } catch {
    return null;
  }
  const parts = ["utm_source", "utm_medium", "utm_campaign"]
    .map((key) => params.get(key)?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => value.slice(0, 80));
  return parts.length > 0 ? parts.join(" / ") : null;
}

function productSlug(path: string): string | null {
  if (!path.startsWith("/product/")) return null;
  const slug = path.slice("/product/".length).split("/")[0] ?? "";
  if (!slug || slug.length > 180) return null;
  return slug;
}

/**
 * A real product open is the PDP data request the browser sends after View product.
 * Store and category rows prefetch `/product/{slug}?_rsc=` and those are not opens.
 */
function apiProductSlug(path: string): string | null {
  if (!path.startsWith("/api/products/")) return null;
  const rest = path.slice("/api/products/".length);
  if (!rest || rest.includes("/")) return null;
  let slug = rest;
  try {
    slug = decodeURIComponent(rest);
  } catch {
    slug = rest;
  }
  if (!slug || slug.length > 180 || slug === "sitemap") return null;
  return slug;
}

/** Product page named in the Referer of a cart add. The add itself does not record the item. */
function refererProduct(referer: string): string | null {
  if (!referer || referer === "-") return null;
  const path = referer.replace(/^https?:\/\/[^/]+/i, "").split("?")[0] ?? "";
  return productSlug(path);
}

/** Browser names that real shoppers almost never send, and catalog crawlers do. */
function isCrawlerBrowser(ua: string): boolean {
  const u = ua.toLowerCase();
  if (u === "mozilla/5.0") return true;
  if (u.includes("android 10; k")) return true;
  if (u.includes("; wv)")) return true;
  if (u.includes("headless")) return true;
  return false;
}

/**
 * A purchase is a person. Otherwise a bot is an address that sprinted through
 * many real product opens, or did most of its browsing with a crawler browser name.
 * Store prefetches are not opens, so a fast walk through the store is not a sprint.
 */
export function classifyAudience(visit: {
  products: number;
  productGaps: number;
  fastProductGaps: number;
  crawlerPages: number;
  browserPages: number;
  bought: boolean;
}): { audience: "human" | "bot"; note: string | null } {
  if (visit.bought) return { audience: "human", note: null };
  const fastShare = visit.productGaps > 0 ? visit.fastProductGaps / visit.productGaps : 0;
  const sprinted = visit.products >= 12 && visit.productGaps >= 8 && fastShare >= 0.55;
  const crawlerLed = visit.crawlerPages >= 8 && visit.crawlerPages > visit.browserPages;
  if (sprinted) {
    return {
      audience: "bot",
      note: `Opened ${visit.products} products a few seconds apart`
    };
  }
  if (crawlerLed) {
    return { audience: "bot", note: "Browser name used by catalog crawlers" };
  }
  return { audience: "human", note: null };
}

function outageReason(group: Array<{ status: number; api: boolean }>): string {
  const shopStopped = group.some((row) => row.status === 502 && !row.api);
  const apiStopped = group.some((row) => row.status === 502 && row.api);
  const slow = group.some((row) => row.status === 504);
  const unavailable = group.some((row) => row.status === 503);
  const parts: string[] = [];
  if (shopStopped) parts.push("The shop was stopped, so pages did not open.");
  if (apiStopped) parts.push("The API was stopped, so those requests did not reach the server.");
  if (slow) parts.push("The server took too long to answer.");
  if (unavailable) parts.push("The server said it was unavailable.");
  return parts.join(" ") || "The server did not answer.";
}

/**
 * One pass over today's log for the Servers detail tables.
 * People and storefront rows exist only when the log has a shopper address.
 */
/** Added to cart, opened checkout, or bought — a person is only in the furthest step. */
export function shopperStage(row: { bought: boolean; checkout: boolean; addedToCart: boolean }): "bought" | "checkout" | "cart" | "other" {
  if (row.bought) return "bought";
  if (row.checkout) return "checkout";
  if (row.addedToCart) return "cart";
  return "other";
}

/** Same buckets as the visitor list. Shoppers only — catalog crawlers stay in the bot tab. */
export function countShopperFunnel(rows: Array<{ audience: "human" | "bot"; bought: boolean; checkout: boolean; addedToCart: boolean }>): {
  addedToCart: number;
  tillCheckout: number;
} {
  let addedToCart = 0;
  let tillCheckout = 0;
  for (const row of rows) {
    if (row.audience !== "human") continue;
    const stage = shopperStage(row);
    if (stage === "cart") addedToCart += 1;
    else if (stage === "checkout") tillCheckout += 1;
  }
  return { addedToCart, tillCheckout };
}

export function detailAccessLines(lines: Iterable<string>, start: Date, end?: Date): AccessDetail {
  type Visit = {
    utm: string | null;
    pages: Set<string>;
    products: string[];
    cartProducts: Set<string>;
    first: number;
    last: number;
    storefrontFirst: number | null;
    storefrontLast: number | null;
    storefront: boolean;
    cart: boolean;
    checkout: boolean;
    bought: boolean;
    lastProductAt: number | null;
    productGaps: number;
    fastProductGaps: number;
    crawlerPages: number;
    browserPages: number;
  };
  const visits = new Map<string, Visit>();
  const missing: MissingPageHit[] = [];
  const down: Array<{ at: number; status: number; api: boolean }> = [];

  for (const line of lines) {
    const m = LINE.exec(line);
    if (!m) continue;
    const when = parseNginxTime(m[2] ?? "");
    if (!when || when < start || (end != null && when >= end)) continue;
    const method = m[3] ?? "";
    const url = m[4] ?? "";
    const status = Number(m[5]);
    const size = Number(m[6]);
    const referer = m[7] ?? "";
    const ua = m[8] ?? "";
    const path = url.split("?")[0] ?? url;
    const ip = clientIp(m[9]);
    const scanner = isScanner(ua, path);
    const browser = ua.toLowerCase().includes("mozilla") && !scanner;
    const at = when.getTime();

    if (status === 502 || status === 503 || status === 504) {
      down.push({ at, status, api: path.startsWith("/api/") });
    }

    if (status === 404 && browser && Number.isFinite(size) && size >= 2000) {
      missing.push({ path, utm: utmLabel(url), at: when.toISOString() });
    }

    if (!browser || !ip) continue;
    let visit = visits.get(ip);
    if (!visit) {
      visit = {
        utm: null,
        pages: new Set(),
        products: [],
        cartProducts: new Set(),
        first: at,
        last: at,
        storefrontFirst: null,
        storefrontLast: null,
        storefront: false,
        cart: false,
        checkout: false,
        bought: false,
        lastProductAt: null,
        productGaps: 0,
        fastProductGaps: 0,
        crawlerPages: 0,
        browserPages: 0
      };
      visits.set(ip, visit);
    }
    if (at < visit.first) visit.first = at;
    if (at > visit.last) visit.last = at;
    const utm = utmLabel(url);
    if (!visit.utm && utm) visit.utm = utm;
    const area = pageArea(path);
    if (area && (method === "GET" || method === "HEAD")) visit.pages.add(area);
    if (isStorefrontPage(method, path)) {
      visit.storefront = true;
      if (visit.storefrontFirst == null || at < visit.storefrontFirst) visit.storefrontFirst = at;
      if (visit.storefrontLast == null || at > visit.storefrontLast) visit.storefrontLast = at;
      if (isCrawlerBrowser(ua)) visit.crawlerPages += 1;
      else visit.browserPages += 1;
    }
    const slug = method === "GET" && status < 400 ? apiProductSlug(path) : null;
    if (slug) {
      visit.products.push(slug);
      if (visit.lastProductAt != null) {
        visit.productGaps += 1;
        if (at - visit.lastProductAt < 8_000) visit.fastProductGaps += 1;
      }
      visit.lastProductAt = at;
    }
    if (method === "POST" && path === "/api/cart/add" && status >= 200 && status < 400) {
      visit.cart = true;
      const added = refererProduct(referer);
      if (added) visit.cartProducts.add(added);
    }
    if ((path === "/checkout" || path.startsWith("/checkout/")) && (method === "GET" || method === "HEAD")) {
      visit.checkout = true;
    }
    if (method === "POST" && (path === "/api/checkout" || path.startsWith("/api/checkout/")) && status < 500) {
      visit.checkout = true;
    }
    if (path.startsWith("/order/confirmed")) visit.bought = true;
  }

  const people: PeopleVisit[] = [...visits.entries()]
    .map(([ip, visit]) => ({
      ip,
      utm: visit.utm,
      pages: [...visit.pages].sort()
    }))
    .sort((a, b) => b.pages.length - a.pages.length || a.ip.localeCompare(b.ip));

  const storefront: StorefrontVisit[] = [...visits.entries()]
    .filter(([, visit]) => visit.storefront)
    .map(([ip, visit]) => {
      const names = visit.products;
      const judged = classifyAudience({
        products: names.length,
        productGaps: visit.productGaps,
        fastProductGaps: visit.fastProductGaps,
        crawlerPages: visit.crawlerPages,
        browserPages: visit.browserPages,
        bought: visit.bought
      });
      const from = visit.storefrontFirst ?? visit.first;
      const to = visit.storefrontLast ?? visit.last;
      return {
        ip,
        utm: visit.utm,
        firstAt: new Date(from).toISOString(),
        lastAt: new Date(to).toISOString(),
        products: names.slice(0, 12),
        productCount: names.length,
        pages: [...visit.pages].sort(),
        cartProducts: [...visit.cartProducts].sort(),
        addedToCart: visit.cart,
        checkout: visit.checkout,
        bought: visit.bought,
        audience: judged.audience,
        note: judged.note
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  missing.sort((a, b) => b.at.localeCompare(a.at));

  const sortedDown = [...down].sort((a, b) => a.at - b.at);
  const groups: Array<typeof sortedDown> = [];
  for (const row of sortedDown) {
    const current = groups[groups.length - 1];
    const prev = current?.[current.length - 1];
    if (!current || !prev || row.at - prev.at > 10 * 60 * 1000) groups.push([row]);
    else current.push(row);
  }
  const outages: ShopOutage[] = groups
    .map((group) => ({
      from: new Date(group[0]!.at).toISOString(),
      to: new Date(group[group.length - 1]!.at).toISOString(),
      requests: group.length,
      reason: outageReason(group)
    }))
    .reverse();

  return { people, storefront, missing: missing.slice(0, 400), outages };
}

export function istDayKey(when: Date): string {
  const ist = new Date(when.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type CheckoutItemKeep = { slug: string; inCart: boolean };

export type CheckoutVisitKeep = {
  clientIp: string;
  firstAt: Date;
  lastAt: Date;
  utm: string | null;
  bought: boolean;
  items: CheckoutItemKeep[];
};

export type TrafficDayKeep = {
  day: string;
  people: number;
  storefrontPageLoads: number;
  missingPages: number;
  checkoutPeople: number;
  checkoutOpens: number;
  cartAdds: number;
  ordersConfirmed: number;
  visits: CheckoutVisitKeep[];
};

type ItemAcc = Map<string, boolean>;

type VisitAcc = {
  first: number;
  last: number;
  utm: string | null;
  checkout: boolean;
  bought: boolean;
  items: ItemAcc;
};

type DayAcc = {
  people: Set<string>;
  storefrontPageLoads: number;
  missingPages: number;
  checkoutOpens: number;
  cartAdds: number;
  confirmed: Set<string>;
  checkout: Map<string, VisitAcc>;
};

const ITEM_CAP = 24;

function dayAcc(): DayAcc {
  return {
    people: new Set(),
    storefrontPageLoads: 0,
    missingPages: 0,
    checkoutOpens: 0,
    cartAdds: 0,
    confirmed: new Set(),
    checkout: new Map()
  };
}

function rememberItem(items: ItemAcc, slug: string, inCart: boolean) {
  const prev = items.get(slug);
  if (prev === true) return;
  if (prev === false && !inCart) return;
  items.set(slug, inCart);
}

/**
 * Daily totals for every shopper, plus a visit row only for people who opened checkout.
 * The same address in a later file is merged, so a day split across two logs is not counted twice.
 */
export async function accumulateRetention(
  lines: Iterable<string> | AsyncIterable<string>,
  into: Map<string, DayAcc> = new Map()
): Promise<Map<string, DayAcc>> {
  for await (const line of lines) {
    const m = LINE.exec(line);
    if (!m) continue;
    const when = parseNginxTime(m[2] ?? "");
    if (!when) continue;
    const method = m[3] ?? "";
    const url = m[4] ?? "";
    const status = Number(m[5]);
    const size = Number(m[6]);
    const referer = m[7] ?? "";
    const ua = m[8] ?? "";
    const path = url.split("?")[0] ?? url;
    const ip = clientIp(m[9]);
    const scanner = isScanner(ua, path);
    const browser = ua.toLowerCase().includes("mozilla") && !scanner;
    if (!browser) continue;

    const key = istDayKey(when);
    let day = into.get(key);
    if (!day) {
      day = dayAcc();
      into.set(key, day);
    }
    if (ip) day.people.add(ip);
    if (isStorefrontPage(method, path)) day.storefrontPageLoads += 1;
    if (status === 404 && Number.isFinite(size) && size >= 2000) day.missingPages += 1;

    const checkoutHit =
      ((path === "/checkout" || path.startsWith("/checkout/")) && (method === "GET" || method === "HEAD")) ||
      (method === "POST" && (path === "/api/checkout" || path.startsWith("/api/checkout/")) && status < 500);
    if (checkoutHit) day.checkoutOpens += 1;
    const cartAdd = method === "POST" && path === "/api/cart/add" && status >= 200 && status < 400;
    if (cartAdd) day.cartAdds += 1;
    if (ip && path.startsWith("/order/confirmed")) day.confirmed.add(ip);
    if (!ip) continue;

    const useful = checkoutHit || cartAdd || path.startsWith("/order/confirmed") || (method === "GET" && status < 400 && apiProductSlug(path));
    let visit = day.checkout.get(ip);
    if (!visit && !useful) continue;
    if (!visit) {
      visit = {
        first: when.getTime(),
        last: when.getTime(),
        utm: utmLabel(url),
        checkout: false,
        bought: false,
        items: new Map()
      };
      day.checkout.set(ip, visit);
    }
    const at = when.getTime();
    if (at < visit.first) visit.first = at;
    if (at > visit.last) visit.last = at;
    if (!visit.utm) visit.utm = utmLabel(url);
    if (checkoutHit) visit.checkout = true;
    if (path.startsWith("/order/confirmed")) visit.bought = true;
    if (cartAdd) {
      const added = refererProduct(referer);
      if (added) rememberItem(visit.items, added, true);
    }
    const slug = method === "GET" && status < 400 ? apiProductSlug(path) : null;
    if (slug) rememberItem(visit.items, slug, false);
  }
  return into;
}

function cappedItems(items: ItemAcc): CheckoutItemKeep[] {
  return [...items.entries()]
    .sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, ITEM_CAP)
    .map(([slug, inCart]) => ({ slug, inCart }));
}

export function retentionFromAccum(into: Map<string, DayAcc>): TrafficDayKeep[] {
  return [...into.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, row]) => ({
      day,
      people: row.people.size,
      storefrontPageLoads: row.storefrontPageLoads,
      missingPages: row.missingPages,
      checkoutPeople: [...row.checkout.values()].filter((visit) => visit.checkout).length,
      checkoutOpens: row.checkoutOpens,
      cartAdds: row.cartAdds,
      ordersConfirmed: row.confirmed.size,
      visits: [...row.checkout.entries()]
        .filter(([, visit]) => visit.checkout)
        .map(([clientIp, visit]) => ({
          clientIp,
          firstAt: new Date(visit.first),
          lastAt: new Date(visit.last),
          utm: visit.utm,
          bought: visit.bought,
          items: cappedItems(visit.items)
        }))
        .sort((a, b) => a.clientIp.localeCompare(b.clientIp))
    }));
}
