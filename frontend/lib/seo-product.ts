import type { ProductDetail, ProductVariantDetail } from "./types";
import { absoluteUrl } from "./site";
import { isVariantCustomerSellable } from "./variant-utils";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Same offer id the Merchant feed puts on the product link. */
function merchantOfferParam(variant: ProductVariantDetail): string {
  const woo = variant.wooCommerceVariationId;
  if (typeof woo === "number" && Number.isInteger(woo) && woo > 0) return String(woo);
  return `sv_${variant.id}`;
}

function variantOffer(product: ProductDetail, variant: ProductVariantDetail) {
  return {
    "@type": "Offer",
    priceCurrency: "INR",
    price: (variant.saleInPaise / 100).toFixed(2),
    availability: isVariantCustomerSellable(variant)
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    sku: variant.sku,
    url: absoluteUrl(`/product/${product.slug}?offer=${encodeURIComponent(merchantOfferParam(variant))}`)
  };
}

export function productJsonLd(product: ProductDetail) {
  const images = product.images.map((i) => i.url).filter(Boolean);
  const price = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const offers = product.variants.map((variant) => variantOffer(product, variant));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: stripHtml(product.seoDescription || product.shortDescription || product.description || ""),
    image: images.length ? images : undefined,
    sku: price?.sku,
    brand: { "@type": "Brand", name: "Sarveda" },
    inLanguage: "en-IN",
    availableAtOrFrom: {
      "@type": "Place",
      name: "India"
    },
    offers: offers.length === 1 ? offers[0] : offers
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

import type { CourseDetail } from "./course-types";
import type { EventDetail } from "./event-types";

export function courseJsonLd(course: CourseDetail) {
  const offer =
    course.priceInPaise > 0
      ? {
          "@type": "Offer",
          priceCurrency: "INR",
          price: (course.priceInPaise / 100).toFixed(2),
          url: absoluteUrl(`/course/${course.slug}`),
          availability: "https://schema.org/InStock"
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.seoDescription || course.shortDescription || undefined,
    image: course.imageUrl ? [course.imageUrl] : undefined,
    provider: { "@type": "Organization", name: "Sarveda", url: absoluteUrl("/") },
    offers: offer
  };
}

export function eventJsonLd(event: EventDetail) {
  const offer =
    event.priceInPaise > 0
      ? {
          "@type": "Offer",
          priceCurrency: "INR",
          price: (event.priceInPaise / 100).toFixed(2),
          url: absoluteUrl(`/event/${event.slug}`),
          availability: "https://schema.org/InStock"
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.seoDescription || event.shortDescription || undefined,
    image: event.imageUrl ? [event.imageUrl] : undefined,
    startDate: event.startDate,
    endDate: event.endDate ?? undefined,
    eventAttendanceMode: event.isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: event.venue
      ? { "@type": "Place", name: event.venue }
      : event.isOnline
        ? { "@type": "VirtualLocation", url: event.zoomLink || absoluteUrl(`/event/${event.slug}`) }
        : undefined,
    offers: offer
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sarveda",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icons/icon-512.png")
  };
}
