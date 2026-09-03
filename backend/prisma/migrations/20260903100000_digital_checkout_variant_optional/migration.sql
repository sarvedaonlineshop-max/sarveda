-- Make DigitalCheckoutOffer.checkoutVariantId optional (JIT cart bridge only).
ALTER TABLE "DigitalCheckoutOffer" ALTER COLUMN "checkoutVariantId" DROP NOT NULL;
