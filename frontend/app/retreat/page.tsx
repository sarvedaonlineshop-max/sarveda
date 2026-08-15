import type { Metadata } from "next";
import Link from "next/link";

import { fetchRetreats } from "@/lib/api";
import { formatINRFromPaise } from "@/lib/money";
import { canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Retreats",
  description: "Wellness retreats with yoga, meditation, sound healing, and Ayurveda at Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/retreat") }
};

export default async function RetreatsPage() {
  const retreats = await fetchRetreats({ cache: "no-store" });

  return (
    <>
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="page-shell py-10">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">Retreats</h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Step away from the everyday — immersive retreats for rest, practice, and renewal.
          </p>
        </div>
      </div>

      <main className="page-shell py-10">
        {retreats.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Retreat listings are being updated.{" "}
            <Link href="/corporate-wellness" className="font-medium text-amber-800 underline">
              Corporate wellness
            </Link>
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {retreats.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/retreat/${r.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-stone-100">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-serif text-lg font-semibold text-stone-900 group-hover:text-amber-900">
                      {r.title}
                    </h2>
                    <p className="mt-2 text-sm text-stone-600">
                      {[r.location, r.duration].filter(Boolean).join(" · ")}
                    </p>
                    {r.priceInPaise != null && r.priceInPaise > 0 ? (
                      <p className="mt-3 text-sm font-medium text-amber-900">
                        From {formatINRFromPaise(r.priceInPaise)}
                      </p>
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
