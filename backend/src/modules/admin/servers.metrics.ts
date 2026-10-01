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
  serverErrors: number;
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
    if (status >= 500 && status <= 599) serverErrors += 1;

    if (browser && ip) people.add(ip);

    if (browser && isStorefrontPage(method, path)) {
      storefrontPageLoads += 1;
      if (ip) storefrontPeople.add(ip);
    }

    const shopperMissingPage = status === 404 && browser && Number.isFinite(size) && size >= 2000;
    const shopperServerError = status >= 500 && status <= 599 && browser;
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
    scanner404,
    linesWithClientIp,
    topShopper404
  };
}
