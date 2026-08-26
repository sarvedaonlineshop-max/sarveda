import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { CorporateContactForm } from "@/components/cms/CorporateContactForm";
import { AutoScrollRail } from "@/components/cms/AutoScrollRail";
import { InfiniteMarquee } from "@/components/cms/InfiniteMarquee";
import type { CmsPage } from "@/lib/cms-types";
import {
  CORPORATE_CONTACT,
  CORPORATE_FACILITATORS,
  CORPORATE_IMG,
  CORPORATE_PARTNER_LOGOS,
  CORPORATE_PROGRAMS,
  CORPORATE_SOLUTIONS,
  CORPORATE_TESTIMONIALS
} from "@/lib/corporate-wellness-data";

type Props = { page: CmsPage };

function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`text-center font-serif text-2xl font-semibold tracking-tight text-stone-900 md:text-3xl lg:text-4xl ${className}`}
    >
      {children}
    </h2>
  );
}

function ProgramCard({
  name,
  subtitle,
  description,
  href,
  image
}: (typeof CORPORATE_PROGRAMS)[number]) {
  return (
    <article
      className="relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-sm bg-stone-900 md:min-h-[380px]"
      style={{
        backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.2) 100%), url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }}
    >
      <div className="relative p-6 text-white md:p-8">
        <h3 className="text-2xl font-bold uppercase tracking-wide md:text-3xl">{name}</h3>
        <span className="mt-3 inline-block rounded-full bg-brand-forest px-4 py-1.5 text-xs font-medium text-white">
          {subtitle}
        </span>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/90 md:text-base">{description}</p>
        <Link
          href={href}
          className="mt-6 inline-block rounded-full border border-white px-6 py-2 text-sm font-medium text-white transition hover:bg-white hover:text-stone-900"
        >
          Learn More
        </Link>
      </div>
    </article>
  );
}

export function CorporateWellnessPage({ page: _page }: Props) {
  return (
    <main className="corporate-wellness bg-white text-stone-900">
      {/* Curated Wellness Programs */}
      <section className="py-14 md:py-20">
        <div className="page-shell-classic">
          <SectionTitle className="mb-10 md:mb-14">Curated Wellness Programs</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2 md:gap-5">
            {CORPORATE_PROGRAMS.map((program) => (
              <ProgramCard key={program.name} {...program} />
            ))}
          </div>
        </div>
      </section>

      {/* Tailored Solutions */}
      <section className="bg-white py-14 md:py-20">
        <div className="page-shell-classic">
          <SectionTitle className="mb-10 md:mb-14">Tailored Wellness Solutions for Every Need</SectionTitle>
          <div className="grid gap-5 md:grid-cols-3">
            {CORPORATE_SOLUTIONS.map((solution) => (
              <article
                key={solution.title}
                className="flex min-h-[200px] flex-col justify-center rounded-2xl bg-[#fdf5f0] p-8"
              >
                <h3 className="flex items-center gap-2 text-base font-bold text-stone-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={solution.icon} alt="" className="h-5 w-5 object-contain" />
                  {solution.title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-stone-600">{solution.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Immersive Retreats — split image / teal panel */}
      <section className="grid md:grid-cols-2">
        <div className="relative min-h-[280px] md:min-h-[420px]">
          <Image
            src={CORPORATE_IMG.retreat}
            alt="Wellness retreat campfire"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
        <div className="flex flex-col justify-center bg-brand-forest px-8 py-12 text-white md:px-14 md:py-16">
          <h2 className="font-serif text-2xl font-semibold md:text-3xl lg:text-4xl">Immersive Wellness Retreats</h2>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/95 md:text-base">
            Recharge with our wellness retreats just outside the city, featuring yoga, meditation, sound healing, and
            organic meals. Enjoy mindfulness activities, nature hikes, and educational sessions on holistic wellness.
          </p>
          <Link
            href="/retreat"
            className="mt-8 inline-flex w-fit rounded-full bg-white px-8 py-3 text-sm font-semibold text-brand-forest transition hover:bg-stone-100"
          >
            Know More
          </Link>
        </div>
      </section>

      {/* Holistic approach */}
      <section className="bg-[#f0f7f4] py-14 md:py-20">
        <div className="page-shell-classic">
          <div className="mx-auto max-w-2xl text-center">
            <SectionTitle>Our Holistic Approach to Wellness</SectionTitle>
            <p className="mt-4 text-sm text-stone-600 md:text-base">
              Physical, Mental, and Emotional well-being are the pillars of a balanced, productive life.
            </p>
          </div>
          <div className="mt-12 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
              <Image
                src={CORPORATE_IMG.holistic}
                alt="Holistic wellness yoga practice"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            <div className="space-y-8">
              {[
                {
                  icon: CORPORATE_IMG.pillarPhysical,
                  title: "Physical Wellbeing",
                  text: "Yoga, deskercise, physiotherapy"
                },
                {
                  icon: CORPORATE_IMG.pillarEmotional,
                  title: "Emotional Wellbeing",
                  text: "Art therapy, gratitude journals, laughter yoga"
                },
                {
                  icon: CORPORATE_IMG.pillarMental,
                  title: "Mental Wellbeing",
                  text: "Guided meditation, breathwork, counseling"
                }
              ].map((pillar) => (
                <div key={pillar.title} className="flex gap-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pillar.icon} alt="" className="h-14 w-14 shrink-0" />
                  <div>
                    <h4 className="text-lg font-bold text-stone-900">{pillar.title}</h4>
                    <p className="mt-1 text-sm text-stone-600">{pillar.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Facilitators — rolling carousel */}
      <section className="bg-[#f0f7f4] py-14 md:py-20">
        <SectionTitle className="mb-10 px-4">Our Facilitators</SectionTitle>
        <InfiniteMarquee duration={55} trackClassName="gap-0">
          {CORPORATE_FACILITATORS.map((f) => (
            <div key={f.name} className="mx-8 w-36 shrink-0 text-center md:mx-12 md:w-40">
              <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-full md:h-36 md:w-36">
                <Image src={f.image} alt={f.name} fill className="object-cover" sizes="144px" />
              </div>
              <h3 className="mt-4 text-sm font-bold text-stone-900">{f.name}</h3>
              <p className="mt-1 text-xs leading-snug text-stone-500">{f.role}</p>
            </div>
          ))}
        </InfiniteMarquee>
      </section>

      {/* Partners — rolling logos (manual scroll + auto) */}
      <section className="bg-white py-14 md:py-20">
        <SectionTitle className="mb-10 px-4">Our Partners in Workplace Wellness</SectionTitle>
        <AutoScrollRail speed={0.6} className="px-2" trackClassName="gap-0 py-2">
          {CORPORATE_PARTNER_LOGOS.map((logo) => (
            <div
              key={logo.src}
              className="mx-10 flex h-16 w-28 shrink-0 items-center justify-center md:mx-16 md:h-20 md:w-32"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.src} alt={logo.alt} className="max-h-full max-w-full object-contain" />
            </div>
          ))}
        </AutoScrollRail>
      </section>

      {/* Wellness in Action — masonry-style gallery */}
      <section className="py-14 md:py-20">
        <div className="page-shell-classic">
          <h2 className="mb-8 font-serif text-2xl font-semibold text-stone-900 md:text-3xl">
            Our Wellness in Action
          </h2>
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
            {CORPORATE_IMG.gallery.map((src, i) => (
              <div key={src} className="mb-3 break-inside-avoid">
                <div className={`relative w-full overflow-hidden ${i === 2 ? "aspect-[3/5]" : "aspect-[4/3]"}`}>
                  <Image
                    src={src}
                    alt={`Corporate wellness session ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-stone-50 py-14 md:py-20">
        <div className="page-shell-classic grid gap-8 md:grid-cols-2">
          {CORPORATE_TESTIMONIALS.map((t) => (
            <blockquote key={t.author} className="rounded-2xl bg-white p-8 shadow-sm">
              <div className="mb-4 flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={CORPORATE_IMG.star} alt="" className="h-4 w-4" />
                ))}
              </div>
              <p className="text-sm leading-relaxed text-stone-700 md:text-base">&ldquo;{t.quote}&rdquo;</p>
              <footer className="mt-6 flex items-center gap-4">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                  <Image src={t.image} alt={t.author} fill className="object-cover" sizes="48px" />
                </div>
                <div>
                  <p className="font-semibold text-stone-900">{t.author}</p>
                  <p className="text-sm text-stone-500">{t.role}</p>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="py-14 md:py-20">
        <div className="page-shell-classic overflow-hidden rounded-3xl border border-stone-200 bg-stone-100 shadow-sm">
          <div className="grid md:grid-cols-5">
            <div className="bg-brand-forest p-8 text-white md:col-span-2 md:p-10">
              <h2 className="text-2xl font-semibold md:text-3xl">Get In Touch With Us</h2>
              <p className="mt-3 text-sm text-white/90">
                Fill up the form and our Team will get back to you within 24 hours.
              </p>
              <div className="mt-8 space-y-6">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={CORPORATE_IMG.mailIcon} alt="" className="h-4 w-4 brightness-0 invert" />
                    Mail Us :
                  </p>
                  <div className="mt-2 space-y-1">
                    {CORPORATE_CONTACT.emails.map((email) => (
                      <a key={email} href={`mailto:${email}`} className="block text-sm text-white/95 hover:underline">
                        {email}
                      </a>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={CORPORATE_IMG.phoneIcon} alt="" className="h-4 w-4 brightness-0 invert" />
                    Phone :
                  </p>
                  <div className="mt-2 space-y-1">
                    {CORPORATE_CONTACT.phones.map((phone) => (
                      <a
                        key={phone}
                        href={`tel:${phone.replace(/\s/g, "")}`}
                        className="block text-sm text-white/95 hover:underline"
                      >
                        {phone}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white p-8 md:col-span-3 md:p-10">
              <CorporateContactForm />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
