import Image from "next/image";

import { ProductRichText } from "@/components/product/ProductRichText";
import { aboutPage } from "@/lib/about-content";
import { resolveMediaUrl } from "@/lib/media-cdn";

const aboutImageSrc =
  resolveMediaUrl("https://sarveda.com/wp-content/uploads/2024/05/about.png") ??
  "/images/about-arjun-family.png";

export function AboutPageContent() {
  return (
    <main className="min-h-[60vh] bg-brand-cream px-4 py-14 sm:px-6 lg:px-8 md:py-20">
      <div className="mx-auto max-w-5xl rounded-2xl border border-brand-cream-dark bg-white p-8 shadow-card sm:p-10">
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">Our story</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-brand-ink">{aboutPage.title}</h1>
            <div className="mt-6 border-t border-brand-cream-dark/60 pt-6">
              <ProductRichText html={aboutPage.html} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
