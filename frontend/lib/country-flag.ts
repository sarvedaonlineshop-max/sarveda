/** ISO 3166-1 alpha-2 → flag emoji (e.g. IN → 🇮🇳). */
export function countryFlagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(
    ...upper.split("").map((char) => 0x1f1e6 - 65 + char.charCodeAt(0))
  );
}

export function countryDisplayName(code: string | null | undefined): string | null {
  if (!code || code.length !== 2) return null;
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Reliable flag image (emoji flags often missing on Windows/Linux). */
export function countryFlagImageUrl(code: string | null | undefined): string | null {
  if (!code || code.length !== 2 || !/^[A-Za-z]{2}$/.test(code)) return null;
  return `https://flagcdn.com/w20/${code.toLowerCase()}.png`;
}
