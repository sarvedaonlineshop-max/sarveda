const STAGING_ORIGINS = [
  "https://sarveda-demo.xyz",
  "https://sarveda-frontend.vercel.app",
  "https://sarveda.com",
  "https://www.sarveda.com"
];

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

function expandOriginVariants(origin: string): string[] {
  const normalized = normalizeOrigin(origin);
  const variants = new Set<string>([normalized]);
  if (normalized.startsWith("http://")) {
    variants.add(`https://${normalized.slice("http://".length)}`);
  } else if (normalized.startsWith("https://")) {
    variants.add(`http://${normalized.slice("https://".length)}`);
  }
  return [...variants];
}

function isSarvedaVercelPreview(origin: string): boolean {
  try {
    const url = new URL(normalizeOrigin(origin));
    if (url.protocol !== "https:") return false;
    return /^sarveda-frontend-[a-z0-9-]+\.vercel\.app$/i.test(url.hostname);
  } catch {
    return false;
  }
}

/** Comma-separated origins in FRONTEND_URL plus optional CORS_ORIGINS. */
export function getCorsOrigins(): string[] {
  const raw = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL_STAGING,
    process.env.CORS_ORIGINS
  ]
    .filter(Boolean)
    .join(",");
  const fromEnv = raw
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean)
    .flatMap(expandOriginVariants);

  const defaults = process.env.NODE_ENV === "production" ? STAGING_ORIGINS : [];
  return [...new Set([...fromEnv, ...defaults])];
}

export function isAllowedCorsOrigin(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return allowed.includes(normalized) || isSarvedaVercelPreview(normalized);
}
