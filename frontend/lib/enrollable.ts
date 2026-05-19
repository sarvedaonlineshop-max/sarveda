export type EnrollmentMode = "CHECKOUT" | "ENQUIRY" | "BOTH";

export type EnrollableItem = {
  slug: string;
  title: string;
  priceInPaise: number;
  enrollmentMode: EnrollmentMode;
  checkoutVariantId: string | null;
};
