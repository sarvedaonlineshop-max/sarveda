import type { EnrollmentMode } from "./enrollable";

export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  imageUrl: string | null;
  startDate: string;
  endDate: string | null;
  venue: string | null;
  isOnline: boolean;
  priceInPaise: number;
  enrollmentMode: EnrollmentMode;
  checkoutVariantId: string | null;
};

export type EventDetail = EventListItem & {
  description: string | null;
  zoomLink: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  extra: Record<string, unknown> | null;
};
