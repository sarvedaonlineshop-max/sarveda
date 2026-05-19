export type BlogListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
};

export type BlogDetail = BlogListItem & {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeyword: string | null;
};
