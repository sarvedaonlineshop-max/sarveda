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
      <div className="border-b border-[rgba(196,176,232,0.25)] bg-brand-bg">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="display-text font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">Retreats</h1>
          <p className="mt-3 max-w-2xl text-brand-mid">
            Step away from the everyday — immersive retreats for rest, practice, and renewal.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {retreats.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[rgba(196,176,232,0.25)] bg-white p-12 text-center text-brand-muted">
            Retreat listings are being updated.{" "}
            <Link href="/corporate-wellness" className="font-medium text-brand-violet underline">
              Corporate wellness
            </Link>
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {retreats.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/retreat/${r.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white shadow-sm transition hover:border-brand-lavender-mid hover:shadow-md"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-brand-violet-light">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-brand-muted">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="display-text font-serif text-lg font-semibold text-brand-ink group-hover:text-brand-violet-mid">
                      {r.title}
                    </h2>
                    <p className="mt-2 text-sm text-brand-mid">
                      {[r.location, r.duration].filter(Boolean).join(" · ")}
                    </p>
                    {r.priceInPaise != null && r.priceInPaise > 0 ? (
                      <p className="mt-3 text-sm font-medium text-brand-violet-mid">
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
