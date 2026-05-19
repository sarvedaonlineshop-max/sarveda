export const CONTENT_TYPES = [
  "pages",
  "courses",
  "events",
  "blog",
  "vaidyas",
  "mentors",
  "retreats",
  "offers",
  "testimonials"
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

export type ContentListRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

export type ContentListResult = {
  items: ContentListRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type ContentCreateBody = {
  title?: string;
  name?: string;
  authorName?: string;
  slug?: string;
  status?: string;
  content?: string | null;
  description?: string | null;
  bio?: string | null;
  body?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeyword?: string | null;
  startDate?: string;
};

export type ContentUpdateBody = Partial<ContentCreateBody>;
