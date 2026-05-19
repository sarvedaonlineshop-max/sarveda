import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { CorporateContactForm } from "@/components/cms/CorporateContactForm";
import { InfiniteMarquee } from "@/components/cms/InfiniteMarquee";
import {
  CORPORATE_CONTACT,
  CORPORATE_IMG,
  CORPORATE_PARTNER_LOGOS,
  CORPORATE_TESTIMONIALS
} from "@/lib/corporate-wellness-data";
import { EXPLORE_WELLNESS_CARDS } from "@/lib/corporate-program-pages-data";

function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`text-center font-sans text-2xl font-semibold tracking-tight text-stone-900 md:text-3xl lg:text-4xl ${className}`}
    >
      {children}
    </h2>
  );
}

export function CorporateExplorePrograms({ excludeSlug }: { excludeSlug?: string }) {
  const cards = EXPLORE_WELLNESS_CARDS.filter((c) => {
    const slug = c.href.replace(/^\//, "");
    return slug !== excludeSlug;
  });

  return (
    <section className="bg-white px-4 py-14 md:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionTitle className="mb-10">Explore Wellness Programs</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.name}
              className="relative flex min-h-[280px] flex-col justify-end overflow-hidden rounded-sm bg-stone-900"
              style={{
                backgroundImage: `linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.3)), url(${card.image})`,
                backgroundSize: "cover",
                backgroundPosition: "center"
              }}
            >
              <div className="p-5 text-white">
                <span className="inline-block rounded-full bg-[#108967] px-3 py-1 text-[10px] font-medium uppercase tracking-wide">
                  {card.subtitle}
                </span>
                <h3 className="mt-3 text-xl font-bold uppercase">{card.name}</h3>
                <p className="mt-2 text-xs leading-relaxed text-white/90">{card.description}</p>
                <Link
                  href={card.href}
                  className="mt-4 inline-block rounded-full border border-white px-4 py-1.5 text-xs font-medium hover:bg-white hover:text-stone-900"
                >
                  Learn More
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CorporateGallery() {
  return (
    <section className="px-4 py-14 md:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-8 font-sans text-2xl font-semibold text-stone-900 md:text-3xl">
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
  );
}

export function CorporatePartners() {
  return (
    <section className="bg-white py-14 md:py-20">
      <SectionTitle className="mb-10 px-4">Our Partners in Workplace Wellness</SectionTitle>
      <InfiniteMarquee duration={50}>
        {CORPORATE_PARTNER_LOGOS.map((logo) => (
          <div
            key={logo.src}
            className="mx-10 flex h-16 w-28 shrink-0 items-center justify-center md:mx-16 md:h-20 md:w-32"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt={logo.alt} className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </InfiniteMarquee>
    </section>
  );
}

export function CorporateTestimonials() {
  return (
    <section className="bg-stone-50 px-4 py-14 md:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-2">
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
  );
}

export function CorporateContact() {
  return (
    <section className="px-4 py-14 md:py-20 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-stone-200 bg-stone-100 shadow-sm">
        <div className="grid md:grid-cols-5">
          <div className="bg-[#108967] p-8 text-white md:col-span-2 md:p-10">
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
  );
}

/** Gallery, partners, testimonials, and contact — used at the bottom of program sub-pages */
export function CorporateProgramFooter({ excludeExploreSlug }: { excludeExploreSlug?: string }) {
  return (
    <>
      <CorporateExplorePrograms excludeSlug={excludeExploreSlug} />
      <CorporateGallery />
      <CorporatePartners />
      <CorporateTestimonials />
      <CorporateContact />
    </>
  );
}
