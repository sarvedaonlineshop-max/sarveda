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
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="page-shell py-10">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">Offers</h1>
          <p className="mt-3 max-w-2xl text-stone-600">Current promotions on courses, events, and wellness programs.</p>
        </div>
      </div>

      <main className="page-shell py-10">
        {offers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            No active offers right now.{" "}
            <Link href="/store" className="font-medium text-amber-800 underline">
              Browse the shop
            </Link>
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {offers.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/offers/${o.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-stone-100">
                    {o.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-serif text-lg font-semibold text-stone-900 group-hover:text-amber-900">
                      {o.title}
                    </h2>
                    {o.description ? (
                      <p className="mt-2 line-clamp-3 text-sm text-stone-600">{o.description}</p>
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
