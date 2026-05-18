import type { ProductDetail } from "./types";
import { absoluteUrl } from "./site";

export function productJsonLd(product: ProductDetail) {
  const images = product.images.map((i) => i.url).filter(Boolean);
  const price = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const offer = price
    ? {
        "@type": "Offer",
        priceCurrency: "INR",
        price: (price.saleInPaise / 100).toFixed(2),
        availability:
          price.inventory && price.inventory.onHand - price.inventory.reserved <= 0
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
        url: absoluteUrl(`/product/${product.slug}`)
      }
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.seoDescription || product.shortDescription || product.description,
    image: images.length ? images : undefined,
    sku: price?.sku,
    brand: { "@type": "Brand", name: "Sarveda" },
    offers: offer
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {})
    }))
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sarveda",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon-512.png")
  };
}
