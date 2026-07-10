import Image from "next/image";

import { ProductRichText } from "@/components/product/ProductRichText";
import { aboutPage } from "@/lib/about-content";
import { resolveMediaUrl } from "@/lib/media-cdn";

const aboutImageSrc =
  resolveMediaUrl("https://sarveda.com/wp-content/uploads/2024/05/about.png") ??
  "/images/about-arjun-family.png";

export function AboutPageContent() {
  return (
    <main className="min-h-[60vh] bg-stone-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-2xl border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="grid gap-8 md:grid-cols-[minmax(220px,336px)_1fr] md:items-start">
          <div className="mx-auto w-full max-w-[336px] md:mx-0">
            <Image
              src={aboutImageSrc}
              alt="Arjun Arora and family"
              width={336}
              height={569}
              className="h-auto w-full rounded-xl object-cover shadow-md"
              priority
            />
          </div>

          <div>
            <h1 className="font-serif text-3xl font-semibold text-stone-900">{aboutPage.title}</h1>
            <div className="mt-6 border-t border-stone-100 pt-6">
              <ProductRichText html={aboutPage.html} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
