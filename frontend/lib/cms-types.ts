export type CmsPage = {
  id: string;
  slug: string;
  title: string;
  content: string | null;
  template: string | null;
  imageUrl: string | null;
  extra: Record<string, unknown> | null;
  seoTitle: string | null;
  seoDescription: string | null;
};
