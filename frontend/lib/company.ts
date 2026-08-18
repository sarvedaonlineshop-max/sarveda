/**
 * Public company identity shown on the storefront.
 * Mirrors backend invoice seller defaults (`SELLER_LEGAL_NAME` / warehouse copy).
 */
export const COMPANY_LEGAL_NAME =
  process.env.NEXT_PUBLIC_SELLER_LEGAL_NAME?.trim() || "Sarveda Life Private Limited";

export const COMPANY_WAREHOUSE_ADDRESS =
  process.env.NEXT_PUBLIC_SELLER_WAREHOUSE_ADDRESS?.trim() ||
  "Sarveda Warehouse, Hebbal Industrial Area, Mysore – 570 016, Karnataka, India.";
