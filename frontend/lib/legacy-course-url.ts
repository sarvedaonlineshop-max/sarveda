/**
 * Old course permalinks → a published course that is the nearest live page.
 * Explicit allowlist only. Current course slugs are left alone.
 */

import { pickSafeLegacyProductQuery } from "./legacy-woo-product-url";

export const LEGACY_COURSE_SLUG_ALIASES: Readonly<Record<string, string>> = {
  "sound-therapy": "sound-therapy-fundamentals",
  "sound-therapy-fundamentals-2": "sound-therapy-fundamentals",
  "rhythmic-foundations-for-sound-practitioners": "rhythmic-foundations",
  "moving-beyond-asanas": "yoga-therapy-course"
};

const KNOWN_COURSE_SLUGS: ReadonlySet<string> = new Set(
  Object.values(LEGACY_COURSE_SLUG_ALIASES)
);

const SLUG_SAFE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function resolveCoursePathToRedirect(
  pathname: string,
  searchParams?: URLSearchParams | Iterable<[string, string]> | null
): string | null {
  if (!pathname) return null;
  const raw = pathname.split("?")[0] ?? "";
  const normalized = raw.replace(/\/+$/, "") || "/";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length !== 2 || parts[0] !== "course") return null;
  const leaf = parts[1] ?? "";
  if (!SLUG_SAFE.test(leaf) || leaf.includes("..")) return null;
  const target = LEGACY_COURSE_SLUG_ALIASES[leaf];
  if (!target || target === leaf || !KNOWN_COURSE_SLUGS.has(target) || !SLUG_SAFE.test(target)) {
    return null;
  }
  const path = `/course/${encodeURIComponent(target)}`;
  if (!searchParams) return path;
  const qs = pickSafeLegacyProductQuery(searchParams);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
