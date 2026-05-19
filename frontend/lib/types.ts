export type CategoryNode = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  seoTitle: string | null;
  seoDescription: string | null;
  children: CategoryNode[];
};

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  status: string;
  productType: string;
  hasAudio: boolean;
  primaryImageUrl: string | null;
  fromPriceInPaise: number | null;
  fromMrpInPaise?: number | null;
  /** Lowest-priced or default active variant — used for quick add from listing */
  defaultVariantId?: string | null;
  categories: { slug: string; name: string }[];
};

export type ProductListResponse = {
  items: ProductListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type VariantAttributeRow = {
  attributeValue: {
    id: string;
    value: string;
    slug: string;
    attribute: {
      id: string;
      name: string;
      slug: string;
    };
  };
};

export type VariantShippingRate = {
  country: string;
  standardPerProduct: number;
  standardAdditional: number;
  expeditedPerProduct: number;
  expeditedAdditional: number;
  codPerProduct: number | null;
  codAdditional: number | null;
  estimatedDays: string | null;
};

export type ProductVariantDetail = {
  id: string;
  sku: string;
  mrpInPaise: number;
  saleInPaise: number;
  mrpUsdCents?: number | null;
  saleUsdCents?: number | null;
  mrpGbpPence?: number | null;
  saleGbpPence?: number | null;
  weightGrams?: number | null;
  isDefault: boolean;
  inventory: { onHand: number; reserved: number } | null;
  attributeValues: VariantAttributeRow[];
  shippingRates?: VariantShippingRate[];
};

export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  productType: string;
  hasAudio: boolean;
  audioUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeyword: string | null;
  variants: ProductVariantDetail[];
  images: {
    id: string;
    url: string;
    altText: string | null;
    position: number;
    isPrimary: boolean;
  }[];
  categories: { category: { slug: string; name: string } }[];
  accordionItems: {
    id: string;
    title: string;
    content: string;
    position: number;
  }[];
};
