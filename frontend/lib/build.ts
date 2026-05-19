/**
 * On Vercel, do not pre-render every PDP/category at build time — hundreds of parallel
 * fetches hit the Express rate limit (200 / 15 min) and return plain-text 429 responses.
 * Pages use `dynamicParams` + ISR on first request instead.
 */
export function skipBuildTimeStaticParams(): boolean {
  return process.env.VERCEL === "1" || process.env.SKIP_STATIC_PARAMS === "1";
}
