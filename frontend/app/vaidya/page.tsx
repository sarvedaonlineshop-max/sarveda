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
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">Vaidyas</h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Meet our Ayurvedic practitioners — traditional wisdom for modern wellbeing.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {vaidyas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Profiles are being updated.
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {vaidyas.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/vaidya/${v.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md"
                >
                  <div className="aspect-square overflow-hidden bg-stone-100">
                    {v.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-serif text-lg font-semibold text-stone-900 group-hover:text-amber-900">{v.name}</h2>
                    {v.speciality ? (
                      <p className="mt-2 text-sm text-stone-600">{v.speciality}</p>
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
