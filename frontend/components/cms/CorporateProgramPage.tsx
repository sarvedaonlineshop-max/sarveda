import Image from "next/image";

import { CorporateProgramFooter } from "@/components/cms/CorporateSharedSections";
import type { CorporateProgramPageData } from "@/lib/corporate-program-pages-data";

type Props = { data: CorporateProgramPageData };

function ContentBlock({
  title,
  body,
  image,
  imagePosition,
  background
}: CorporateProgramPageData["sections"][number]) {
  const textCol = (
    <div className="flex flex-col justify-center">
      <h2 className="font-serif text-xl font-semibold text-stone-900 md:text-2xl lg:text-3xl">{title}</h2>
      <p className="mt-4 text-sm leading-relaxed text-stone-600 md:text-base">{body}</p>
    </div>
  );
  const imageCol = (
    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl md:aspect-[5/4]">
      <Image src={image} alt={title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
    </div>
  );

  return (
    <section className="px-4 py-12 md:py-16 lg:px-8" style={{ backgroundColor: background }}>
      <div className="mx-auto grid max-w-7xl items-center gap-8 md:grid-cols-2 md:gap-12">
        {imagePosition === "left" ? (
          <>
            {imageCol}
            {textCol}
          </>
        ) : (
          <>
            {textCol}
            {imageCol}
          </>
        )}
      </div>
    </section>
  );
}

export function CorporateProgramPage({ data }: Props) {
  return (
    <main className="corporate-program bg-white text-stone-900">
      {/* Hero */}
      <section
        className="relative flex min-h-[320px] items-center bg-stone-900 md:min-h-[420px]"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${data.hero.banner})`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="max-w-4xl font-serif text-4xl font-bold uppercase tracking-wide text-white md:text-5xl lg:text-6xl">
            {data.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-white/95 md:text-lg">{data.hero.subtitle}</p>
        </div>
      </section>

      {/* Framework pillars */}
      <section className="bg-white px-4 py-14 md:py-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="mx-auto max-w-3xl text-center text-sm leading-relaxed text-stone-600 md:text-base">
            {data.frameworkIntro}
          </p>
          <div
            className={`mt-10 grid gap-6 ${
              data.pillars.length >= 5
                ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
                : data.pillars.length === 2
                  ? "mx-auto max-w-2xl sm:grid-cols-2"
                  : "sm:grid-cols-3"
            }`}
          >
            {data.pillars.map((pillar) => (
              <div key={pillar.title} className="text-center">
                <div className="relative mx-auto aspect-square max-w-[220px] overflow-hidden rounded-2xl">
                  <Image
                    src={pillar.image}
                    alt={pillar.title}
                    fill
                    className="object-cover"
                    sizes="220px"
                  />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-stone-900 md:text-base">{pillar.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Optional quote block (SAMSARA) */}
      {data.quoteBlock ? (
        <section className="bg-white px-4 py-12 md:py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl items-start gap-8 md:grid-cols-2 md:gap-12">
            <h2 className="font-serif text-xl font-semibold leading-snug text-stone-900 md:text-2xl lg:text-3xl">
              {data.quoteBlock.title}
            </h2>
            <div className="space-y-4">
              {data.quoteBlock.paragraphs.map((p) => (
                <p key={p.slice(0, 40)} className="text-sm leading-relaxed text-stone-600 md:text-base">
                  {p}
                </p>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Detail sections */}
      {data.sections.map((section) => (
        <ContentBlock key={section.title} {...section} />
      ))}

      <CorporateProgramFooter excludeExploreSlug={data.slug} />
    </main>
  );
}
