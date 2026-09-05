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

/**
 * TEMPORARY PREVIEW TESTING ONLY — remove before merging this feature to production.
 * Vercel generates preview hosts such as:
 * https://sarveda-frontend-k76x4rxhz-sarveda.vercel.app
 *
 * Keep this scoped to Sarveda's frontend deployment-name pattern rather than allowing
 * arbitrary *.vercel.app origins.
 */
function isSarvedaVercelPreviewOrigin(origin: string): boolean {
  return /^https:\/\/sarveda-frontend-[a-z0-9-]+-sarveda\.vercel\.app$/i.test(normalizeOrigin(origin));
}

export function isAllowedCorsOrigin(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return allowed.includes(normalized) || isSarvedaVercelPreviewOrigin(normalized);
}
