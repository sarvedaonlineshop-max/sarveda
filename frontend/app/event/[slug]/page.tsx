import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseEnrollActions } from "@/components/course/CourseEnrollActions";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductRichText } from "@/components/product/ProductRichText";
import { JsonLd } from "@/components/seo/JsonLd";
import { fetchEventBySlug, fetchEventSlugs, skipBuildTimeStaticParams } from "@/lib/api";
import { breadcrumbJsonLd, eventJsonLd } from "@/lib/seo-product";
import { htmlToPlainText } from "@/lib/sanitize-html";
import { absoluteUrl, canonical, isProductionSite } from "@/lib/site";

export const dynamicParams = true;
export const revalidate = 300;

export async function generateStaticParams() {
  if (skipBuildTimeStaticParams()) return [];
  const slugs = await fetchEventSlugs({ next: { revalidate: 3600 } });
  return slugs.map((slug) => ({ slug }));
}

type Props = { params: { slug: string } };

function metaDescription(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const plain = htmlToPlainText(raw);
  if (!plain) return undefined;
  return plain.length > 160 ? `${plain.slice(0, 157)}…` : plain;
}

function formatWhen(start: string, end: string | null): string {
  const s = new Date(start);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  };
  let text = s.toLocaleString("en-IN", opts);
  if (end) {
    const e = new Date(end);
    text += ` – ${e.toLocaleString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
  }
  return text;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await fetchEventBySlug(params.slug, { next: { revalidate: 300 } });
  if (!event) return { title: "Event" };
  const title = event.seoTitle || event.title;
  const description = metaDescription(
    event.seoDescription || event.shortDescription || event.description
  );
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: event.imageUrl ? [{ url: event.imageUrl }] : undefined,
      siteName: "Sarveda"
    },
    robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: canonical(`/event/${params.slug}`) }
  };
}

export default async function EventDetailPage({ params }: Props) {
  const event = await fetchEventBySlug(params.slug, { next: { revalidate: 300 } });
  if (!event) notFound();

  const breadcrumbItems = [
    { name: "Home", url: absoluteUrl("/") },
    { name: "Events", url: absoluteUrl("/events") },
    { name: event.title, url: absoluteUrl(`/event/${event.slug}`) }
  ];

  return (
    <>
      <JsonLd data={[eventJsonLd(event), breadcrumbJsonLd(breadcrumbItems)]} />

      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 md:py-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Events", href: "/events" },
              { label: event.title }
            ]}
          />
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px] lg:gap-12">
          <div>
            <p className="text-sm font-medium text-amber-800">{formatWhen(event.startDate, event.endDate)}</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
              {event.title}
            </h1>
            {event.shortDescription ? (
              <p className="mt-4 text-lg text-stone-600">{event.shortDescription}</p>
            ) : null}
            {event.venue ? (
              <p className="mt-2 text-stone-600">
                <span className="font-medium text-stone-800">Location:</span> {event.venue}
              </p>
            ) : null}
            {event.isOnline && event.zoomLink ? (
              <p className="mt-2 text-sm text-stone-600">Online event — link shared after registration.</p>
            ) : null}

            {event.imageUrl ? (
              <div className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <Image
                  src={event.imageUrl}
                  alt={event.title}
                  width={1200}
                  height={750}
                  className="h-auto w-full object-cover"
                  sizes="(max-width: 1024px) 100vw, 66vw"
                />
              </div>
            ) : null}

            {event.description ? (
              <div className="mt-10">
                <ProductRichText html={event.description} />
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <CourseEnrollActions
              item={event}
              pathPrefix="event"
              payLabel="Register & pay online"
            />
            <p className="mt-4 text-center text-sm text-stone-500">
              <Link href="/events" className="text-amber-800 underline hover:text-amber-900">
                ← All events
              </Link>
            </p>
          </aside>
        </div>
      </main>
    </>
  );
}
