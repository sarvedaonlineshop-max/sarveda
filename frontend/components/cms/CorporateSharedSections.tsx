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

const EXPLORE_GRADIENTS = [
  "linear-gradient(160deg, #22134A 0%, #5B3E9B 100%)",
  "linear-gradient(135deg, #C8A460 0%, #7B5EC0 100%)",
  "linear-gradient(160deg, #3D5C3D 0%, #5A8C6B 100%)",
  "linear-gradient(160deg, #C45A4A 0%, #5B3E9B 100%)"
];

function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`display-text text-center text-3xl font-light text-brand-ink md:text-4xl ${className}`}>
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
    <section className="bg-brand-bg px-4 py-14 md:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionTitle className="mb-10">Explore Wellness Programs</SectionTitle>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card, index) => (
            <article
              key={card.name}
              className="flex min-h-[300px] flex-col overflow-hidden rounded-[20px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory transition-shadow hover:shadow-card-hover"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <div className="absolute inset-0" style={{ background: EXPLORE_GRADIENTS[index % EXPLORE_GRADIENTS.length] }} />
                <Image src={card.image} alt="" fill className="object-cover mix-blend-overlay opacity-85" sizes="25vw" />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-[10px] font-normal uppercase tracking-[0.16em] text-brand-violet">
                  Program {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="display-text mt-2 text-xl font-semibold text-brand-violet">{card.name}</h3>
                <p className="mt-1 text-xs text-brand-violet-mid">{card.subtitle}</p>
                <p className="mt-3 flex-1 text-[13px] font-light leading-[1.65] text-brand-mid">{card.description}</p>
                <Link
                  href={card.href}
                  className="mt-4 inline-flex w-fit rounded-sm border border-[rgba(196,176,232,0.35)] px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-violet hover:bg-brand-violet-light"
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
        <h2 className="display-text mb-8 text-3xl font-light text-brand-ink md:text-4xl">Our Wellness in Action</h2>
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
          {CORPORATE_IMG.gallery.map((src, i) => (
            <div key={src} className="mb-3 break-inside-avoid">
              <div
                className={`relative w-full overflow-hidden rounded-xl border border-[rgba(196,176,232,0.2)] ${i === 2 ? "aspect-[3/5]" : "aspect-[4/3]"}`}
              >
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
    <section
      className="border-y py-14 md:py-20"
      style={{ background: "#EDE8FB", borderColor: "rgba(196,176,232,0.2)" }}
    >
      <SectionTitle className="mb-10 px-4">Our Partners in Workplace Wellness</SectionTitle>
      <InfiniteMarquee duration={50}>
        {CORPORATE_PARTNER_LOGOS.map((logo) => (
          <div
            key={logo.src}
            className="mx-6 flex h-16 w-32 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(196,176,232,0.25)] bg-white px-4 md:mx-8 md:h-20 md:w-36"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt={logo.alt} className="max-h-12 max-w-full object-contain" />
          </div>
        ))}
      </InfiniteMarquee>
    </section>
  );
}

export function CorporateTestimonials() {
  return (
    <section className="px-4 py-14 md:py-20 lg:px-8" style={{ background: "#22134A" }}>
      <div className="mx-auto max-w-4xl space-y-12">
        {CORPORATE_TESTIMONIALS.map((t) => (
          <blockquote key={t.author} className="text-center">
            <p className="display-text text-xl font-light italic leading-relaxed text-brand-lavender md:text-2xl">
              &ldquo;{t.quote}&rdquo;
            </p>
            <footer className="mt-8 flex flex-col items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border border-[rgba(196,176,232,0.25)]">
                <Image src={t.image} alt={t.author} fill className="object-cover" sizes="56px" />
              </div>
              <div>
                <p className="text-base font-medium text-brand-lavender">{t.author}</p>
                <p className="mt-1 text-sm font-light text-[rgba(196,176,232,0.45)]">{t.role}</p>
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
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[20px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory shadow-card">
        <div className="grid md:grid-cols-5">
          <div className="p-8 text-white md:col-span-2 md:p-10" style={{ background: "#22134A" }}>
            <h2 className="display-text text-2xl font-normal md:text-3xl">Get In Touch With Us</h2>
            <p className="mt-3 text-sm font-light text-[rgba(196,176,232,0.55)]">
              Fill up the form and our Team will get back to you within 24 hours.
            </p>
            <div className="mt-8 space-y-6">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-brand-lavender">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={CORPORATE_IMG.mailIcon} alt="" className="h-4 w-4 brightness-0 invert" />
                  Mail Us :
                </p>
                <div className="mt-2 space-y-1">
                  {CORPORATE_CONTACT.emails.map((email) => (
                    <a
                      key={email}
                      href={`mailto:${email}`}
                      className="block text-sm text-[rgba(196,176,232,0.75)] hover:text-brand-lavender hover:underline"
                    >
                      {email}
                    </a>
                  ))}
                </div>
              </div>
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-brand-lavender">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={CORPORATE_IMG.phoneIcon} alt="" className="h-4 w-4 brightness-0 invert" />
                  Phone :
                </p>
                <div className="mt-2 space-y-1">
                  {CORPORATE_CONTACT.phones.map((phone) => (
                    <a
                      key={phone}
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      className="block text-sm text-[rgba(196,176,232,0.75)] hover:text-brand-lavender hover:underline"
                    >
                      {phone}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-brand-ivory p-8 md:col-span-3 md:p-10">
            <CorporateContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}

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
