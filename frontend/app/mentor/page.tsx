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
      <div className="border-b border-[rgba(196,176,232,0.25)] bg-brand-bg">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="display-text font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">Mentors</h1>
          <p className="mt-3 max-w-2xl text-brand-mid">
            Learn from experienced guides in yoga, meditation, and holistic living.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {mentors.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[rgba(196,176,232,0.25)] bg-white p-12 text-center text-brand-muted">
            Profiles are being updated.
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {mentors.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/mentor/${m.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white shadow-sm transition hover:border-brand-lavender-mid hover:shadow-md"
                >
                  <div className="aspect-square overflow-hidden bg-brand-violet-light">
                    {m.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-brand-muted">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="display-text font-serif text-lg font-semibold text-brand-ink group-hover:text-brand-violet-mid">
                      {m.name}
                    </h2>
                    {m.expertise ? <p className="mt-2 text-sm text-brand-mid">{m.expertise}</p> : null}
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
