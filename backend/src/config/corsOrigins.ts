/** Comma-separated origins in FRONTEND_URL plus optional CORS_ORIGINS. */
export function getCorsOrigins(): string[] {
  const raw = [process.env.FRONTEND_URL, process.env.CORS_ORIGINS].filter(Boolean).join(",");
  const origins = raw
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (!origins.length) {
    return ["http://localhost:3000"];
  }
  return [...new Set(origins)];
}
