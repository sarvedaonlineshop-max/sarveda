import type { Metadata } from "next";
import Link from "next/link";

import { fetchOffers } from "@/lib/api";
import { canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Offers",
  description: "Special offers and promotions from Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/offers") }
};

export default async function OffersPage() {
  const offers = await fetchOffers({ cache: "no-store" });

  return (
    <>
      <div className="border-b border-[rgba(196,176,232,0.25)] bg-brand-bg">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="display-text font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">Offers</h1>
          <p className="mt-3 max-w-2xl text-brand-mid">Current promotions on courses, events, and wellness programs.</p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {offers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[rgba(196,176,232,0.25)] bg-white p-12 text-center text-brand-muted">
            No active offers right now.{" "}
            <Link href="/shop" className="font-medium text-brand-violet underline">
              Browse the shop
            </Link>
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/offers/${o.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white shadow-sm transition hover:border-brand-lavender-mid hover:shadow-md"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-brand-violet-light">
                    {o.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-brand-muted">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="display-text font-serif text-lg font-semibold text-brand-ink group-hover:text-brand-violet-mid">
                      {o.title}
                    </h2>
                    {o.description ? (
                      <p className="mt-2 line-clamp-3 text-sm text-brand-mid">{o.description}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
