/**
 * Products that did not take Aug 09 sheet prices onto Lightsail
 * (sheet INR blank exact match, or no exact SKU match).
 * Source: data/Sarveda_LS_Store_153_Reconciliation.xlsx
 */
export type XlPriceReviewReason = "SHEET_BLANK" | "SKU_MISMATCH";

export const XL_PRICE_REVIEW_PRODUCTS: ReadonlyArray<{
  slug: string;
  reason: XlPriceReviewReason;
  label: string;
}> = [
  // 10 — exact SKU; sheet INR blank → retained LS prices
  { slug: "ankh", reason: "SHEET_BLANK", label: "Ankh" },
  { slug: "crystal-bowl-with-handle", reason: "SHEET_BLANK", label: "Crystal Bowl with Handle" },
  { slug: "large-tuning-fork", reason: "SHEET_BLANK", label: "DNA Tuning Fork" },
  { slug: "incense-stick-stand", reason: "SHEET_BLANK", label: "Incense Stick Stand" },
  { slug: "joint-knee-cut-bowl", reason: "SHEET_BLANK", label: "Joint / Knee Cut Bowl" },
  { slug: "singing-bowl-set-g-a-b", reason: "SHEET_BLANK", label: "Singing Bowl Head Set – G, A, B" },
  { slug: "sleigh-bells-wooden-jingle-stick", reason: "SHEET_BLANK", label: "Sleigh Bells Wooden Jingle Stick" },
  { slug: "solar-bell", reason: "SHEET_BLANK", label: "Solar Bell" },
  { slug: "wooden-finger-castanet", reason: "SHEET_BLANK", label: "Wooden Finger Castanet" },
  { slug: "wooden-guiro", reason: "SHEET_BLANK", label: "Wooden Guiro" },
  // 8 — no exact SKU in Aug 09 sheet
  { slug: "8-key-kalimba", reason: "SKU_MISMATCH", label: "8 Key Kalimba" },
  { slug: "elemental-chimes-new", reason: "SKU_MISMATCH", label: "Elemental Chimes" },
  { slug: "etched-gongs", reason: "SKU_MISMATCH", label: "Etched Chau Gongs" },
  { slug: "kenari-seed-shell-shakers", reason: "SKU_MISMATCH", label: "Kenari Seed Shell Shakers" },
  { slug: "mini-flat-maracas", reason: "SKU_MISMATCH", label: "Mini Flat Maracas" },
  { slug: "rectangle-wooden-maracas-shaker", reason: "SKU_MISMATCH", label: "Rectangle Wooden Maracas Shaker" },
  { slug: "shankh-conch", reason: "SKU_MISMATCH", label: "Shankh/Conch" },
  { slug: "wooden-hand-taal-khartal", reason: "SKU_MISMATCH", label: "Wooden Hand Khartal/Jingles" },
];

export const XL_PRICE_REVIEW_SLUGS = XL_PRICE_REVIEW_PRODUCTS.map((p) => p.slug);

export const XL_PRICE_REVIEW_BY_SLUG = new Map(
  XL_PRICE_REVIEW_PRODUCTS.map((p) => [p.slug, p] as const)
);

export function priceReviewReasonLabel(reason: XlPriceReviewReason): string {
  return reason === "SHEET_BLANK" ? "Sheet blank (kept LS)" : "No exact SKU";
}
