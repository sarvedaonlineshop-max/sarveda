import Image from "next/image";

import { ContentDocumentShell } from "@/components/content/ContentDocumentShell";
import { ProductRichText } from "@/components/product/ProductRichText";
import { aboutPage } from "@/lib/about-content";
import { resolveMediaUrl } from "@/lib/media-cdn";

const aboutImageSrc =
  resolveMediaUrl("https://sarveda.com/wp-content/uploads/2024/05/about.png") ??
  "/images/about-arjun-family.png";

export function AboutPageContent() {
  return (
    <ContentDocumentShell
      eyebrow="Our story"
      title={aboutPage.title}
      description={aboutPage.metaDescription}
      maxWidth="5xl"
      headerAside={
        <Image
          src={aboutImageSrc}
          alt="Arjun Arora and family"
          width={336}
          height={569}
          className="h-auto w-full rounded-xl object-cover shadow-md"
          priority
        />
      }
    >
      <ProductRichText html={aboutPage.html} className="leading-8" />
    </ContentDocumentShell>
  );
}
