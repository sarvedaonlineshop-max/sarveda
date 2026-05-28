import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { fetchBlogPosts } from "@/lib/api";
import { canonical, isProductionSite } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Insights",
  description: "Articles on yoga, meditation, Ayurveda, sound healing, and mindful living from Sarveda.",
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  alternates: { canonical: canonical("/insights") }
};

function formatPublishedDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return "";
  }
}

export default async function InsightsPage() {
  const posts = await fetchBlogPosts({ cache: "no-store" });

  return (
    <>
      <div className="border-b border-stone-100 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            Insights
          </h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Stories and guides on yoga, Ayurveda, sound healing, and living with intention.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center text-stone-500">
            Articles are being updated.{" "}
            <Link href="/shop" className="font-medium text-amber-800 underline">
              Browse the shop
            </Link>
          </p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/${post.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:border-amber-300 hover:shadow-md"
                >
                  <div className="aspect-[16/10] overflow-hidden bg-stone-100">
                    {post.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <Image
                        src={post.imageUrl}
                        alt={post.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-stone-400">Sarveda</div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    {post.publishedAt ? (
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                        {formatPublishedDate(post.publishedAt)}
                      </p>
                    ) : null}
                    <h2 className="mt-2 font-serif text-lg font-semibold text-stone-900 group-hover:text-amber-900">
                      {post.title}
                    </h2>
                    {post.excerpt ? (
                      <p className="mt-2 line-clamp-3 text-sm text-stone-600">{post.excerpt}</p>
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

