import type { Metadata } from "next";
import Link from "next/link";

import { fetchMentors } from "@/lib/api";
import { canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mentors",
  description: "Yoga, meditation, and wellness mentors at Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/mentor") }
};

export default async function MentorsPage() {
  const mentors = await fetchMentors({ cache: "no-store" });

  return (
    <>
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="page-shell py-10">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">Mentors</h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Learn from experienced guides in yoga, meditation, and holistic living.
          </p>
        </div>
      </div>

      <main className="page-shell py-10">
        {mentors.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Profiles are being updated.
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {mentors.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/mentor/${m.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md"
                >
                  <div className="aspect-square overflow-hidden bg-stone-100">
                    {m.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-serif text-lg font-semibold text-stone-900 group-hover:text-amber-900">
                      {m.name}
                    </h2>
                    {m.expertise ? <p className="mt-2 text-sm text-stone-600">{m.expertise}</p> : null}
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
