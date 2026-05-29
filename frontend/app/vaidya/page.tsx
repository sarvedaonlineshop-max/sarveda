import type { Metadata } from "next";
import Link from "next/link";

import { fetchVaidyas } from "@/lib/api";
import { canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vaidyas",
  description: "Ayurvedic practitioners and wellness guides at Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/vaidya") }
};

export default async function VaidyasPage() {
  const vaidyas = await fetchVaidyas({ cache: "no-store" });

  return (
    <>
      <div className="border-b border-[rgba(196,176,232,0.25)] bg-brand-bg">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="display-text font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl">Vaidyas</h1>
          <p className="mt-3 max-w-2xl text-brand-mid">
            Meet our Ayurvedic practitioners — traditional wisdom for modern wellbeing.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {vaidyas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[rgba(196,176,232,0.25)] bg-white p-12 text-center text-brand-muted">
            Profiles are being updated.
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {vaidyas.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/vaidya/${v.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white shadow-sm transition hover:border-brand-lavender-mid hover:shadow-md"
                >
                  <div className="aspect-square overflow-hidden bg-brand-violet-light">
                    {v.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-brand-muted">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="display-text font-serif text-lg font-semibold text-brand-ink group-hover:text-brand-violet-mid">{v.name}</h2>
                    {v.speciality ? (
                      <p className="mt-2 text-sm text-brand-mid">{v.speciality}</p>
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
