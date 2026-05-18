export type CourseEnrollmentMode = "CHECKOUT" | "ENQUIRY" | "BOTH";

export type CourseListItem = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  imageUrl: string | null;
  priceInPaise: number;
  priceUsdCents: number | null;
  isFree: boolean;
  enrollmentMode: CourseEnrollmentMode;
  checkoutVariantId: string | null;
};

export type CourseDetail = CourseListItem & {
  description: string | null;
  videoUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  extra: Record<string, unknown> | null;
};
