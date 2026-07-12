/** Policy + contact links shown in mobile menu (all pages) and shop desktop footer. */
export const MOBILE_MENU_POLICY_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Refund Policy", href: "/refunds" },
  { label: "Shipping Policy", href: "/shipping" },
  { label: "Contact Us", href: "/contact" }
] as const;

/** @deprecated Use MOBILE_MENU_POLICY_LINKS */
export const SHOP_POLICY_LINKS = MOBILE_MENU_POLICY_LINKS;
