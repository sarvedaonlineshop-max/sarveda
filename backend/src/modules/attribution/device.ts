export type DeviceType = "DESKTOP" | "MOBILE" | "TABLET" | "OTHER";

/**
 * Server-side UA classification for order attribution.
 * Prefer this over any client-provided device enum.
 */
export function classifyDeviceFromUserAgent(uaRaw: string | null | undefined): DeviceType {
  const ua = (uaRaw ?? "").trim().toLowerCase();
  if (!ua) return "OTHER";

  // Tablets before mobile (iPad; Android tablets often omit "mobile")
  if (
    ua.includes("ipad") ||
    ua.includes("tablet") ||
    (ua.includes("android") && !ua.includes("mobile")) ||
    ua.includes("kindle") ||
    ua.includes("silk/")
  ) {
    return "TABLET";
  }

  if (
    ua.includes("mobi") ||
    ua.includes("iphone") ||
    ua.includes("ipod") ||
    ua.includes("android") ||
    ua.includes("windows phone")
  ) {
    return "MOBILE";
  }

  if (
    ua.includes("windows") ||
    ua.includes("macintosh") ||
    ua.includes("linux") ||
    ua.includes("cros") ||
    ua.includes("x11")
  ) {
    return "DESKTOP";
  }

  return "OTHER";
}
