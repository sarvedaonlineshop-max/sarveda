/** Re-export — course checkout now uses DigitalCheckoutOffer table. */
export {
  ensureCourseCheckoutVariant,
  ensureDigitalCheckoutOffer,
  ensureDigitalCheckoutShell,
  materializeDigitalCheckoutVariant,
  DIGITAL_CHECKOUT_SHELL_SLUG
} from "./digital-checkout-offer";
