import Image from "next/image";

import { ContentDocumentShell } from "@/components/content/ContentDocumentShell";
import { ProductRichText } from "@/components/product/ProductRichText";
import { aboutPage } from "@/lib/about-content";

const ABOUT_IMAGES = [
  {
    src: "/images/about/about-us-1.jpeg",
    alt: "Sarveda founders and family"
  },
  {
    src: "/images/about/about-us-2.jpeg",
    alt: "Sarveda team and community"
  }
] as const;

export function AboutPageContent() {
  return (
    <ContentDocumentShell
      eyebrow="Our story"
      title={aboutPage.title}
      description={aboutPage.metaDescription}
      maxWidth="5xl"
      headerAside={
        <div className="flex w-full flex-col gap-4">
          {ABOUT_IMAGES.map((img) => (
            <Image
              key={img.src}
              src={img.src}
              alt={img.alt}
              width={336}
              height={420}
              className="h-auto w-full rounded-xl object-cover shadow-md"
              priority={img.src.endsWith("about-us-1.jpeg")}
            />
          ))}
        </div>
      }
    >
      <ProductRichText html={aboutPage.html} className="leading-8" />
    </ContentDocumentShell>
  );
}
