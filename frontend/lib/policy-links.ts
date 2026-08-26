/** Policy + contact links — mobile BottomNav menu and desktop slim footer (all non-home pages). */
export const MOBILE_MENU_POLICY_LINKS = [
  { label: "About Us", href: "/about" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Refund Policy", href: "/refunds" },
  { label: "Shipping Policy", href: "/shipping" },
  { label: "Contact Us", href: "/contact" }
] as const;

/** @deprecated Use MOBILE_MENU_POLICY_LINKS */
export const SHOP_POLICY_LINKS = MOBILE_MENU_POLICY_LINKS;
