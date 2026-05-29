import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { CorporateContactForm } from "@/components/cms/CorporateContactForm";
import { InfiniteMarquee } from "@/components/cms/InfiniteMarquee";
import { PageListHero } from "@/components/layout/PageListHero";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
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

const PROGRAM_GRADIENTS = [
  "linear-gradient(160deg, #22134A 0%, #5B3E9B 100%)",
  "linear-gradient(135deg, #C8A460 0%, #7B5EC0 100%)",
  "linear-gradient(160deg, #3D5C3D 0%, #5A8C6B 100%)",
  "linear-gradient(160deg, #C45A4A 0%, #5B3E9B 100%)"
];

function SectionTitle({ children, className = "", dark = false }: { children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <h2
      className={`display-text text-center text-3xl font-light md:text-4xl ${
        dark ? "text-brand-violet-pale" : "text-brand-ink"
      } ${className}`}
    >
      {children}
    </h2>
  );
}

function ProgramCard({
  program,
  index
}: {
  program: (typeof CORPORATE_PROGRAMS)[number];
  index: number;
}) {
  const num = String(index + 1).padStart(2, "0");
  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] border border-[rgba(196,176,232,0.25)] bg-brand-ivory transition-shadow hover:shadow-card-hover">
      <div className="relative aspect-[16/10] overflow-hidden">
        <div className="absolute inset-0" style={{ background: PROGRAM_GRADIENTS[index % PROGRAM_GRADIENTS.length] }} />
        <Image src={program.image} alt="" fill className="object-cover mix-blend-overlay opacity-90" sizes="(max-width: 768px) 100vw, 50vw" />
      </div>
      <div className="flex flex-1 flex-col p-6 md:p-8">
        <p className="text-[10px] font-normal uppercase tracking-[0.16em] text-brand-violet">Program {num}</p>
        <h3 className="display-text mt-2 text-2xl font-semibold text-brand-violet">{program.name}</h3>
        <p className="mt-2 text-xs font-normal text-brand-violet-mid">{program.subtitle}</p>
        <p className="mt-4 flex-1 text-[13px] font-light leading-[1.65] text-brand-mid">{program.description}</p>
        <Link
          href={program.href}
          className="mt-6 inline-flex w-fit rounded-sm bg-brand-violet px-6 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-brand-violet-mid"
        >
          Learn More
        </Link>
      </div>
    </article>
  );
}

export function CorporateWellnessPage({ page }: Props) {
  const heroSubtitle =
    page.seoDescription?.trim() ||
    "Tailored yoga, mindfulness, sound, and art therapy programmes for modern workplaces across India.";

  const titleWords = (page.title || "Corporate Wellness").trim().split(/\s+/);
  const titleAccent = titleWords.length > 1 ? titleWords.pop()! : "";
  const titleLead = titleWords.join(" ") || page.title || "Corporate";

  return (
    <main className="corporate-wellness bg-brand-bg text-brand-ink">
      <PageListHero
        variant="corporate"
        eyebrow="For organisations"
        title={
          <>
            {titleLead}
            {titleAccent ? <> <span className="italic text-brand-lavender">{titleAccent}</span></> : null}
          </>
        }
        subtitle={heroSubtitle}
        topSlot={
          <div className="mb-4">
            <Breadcrumbs
              variant="onDark"
              items={[{ label: "Home", href: "/" }, { label: page.title || "Corporate Wellness" }]}
            />
          </div>
        }
      />

      <section className="px-4 py-14 md:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle className="mb-10 md:mb-14">Curated Wellness Programs</SectionTitle>
          <div className="grid gap-6 md:grid-cols-2 md:gap-8">
            {CORPORATE_PROGRAMS.map((program, index) => (
              <ProgramCard key={program.name} program={program} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-ivory px-4 py-14 md:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle className="mb-10 md:mb-14">Tailored Wellness Solutions for Every Need</SectionTitle>
          <div className="grid gap-5 md:grid-cols-3">
            {CORPORATE_SOLUTIONS.map((solution) => (
              <article
                key={solution.title}
                className="flex min-h-[200px] flex-col justify-center rounded-[18px] border border-[rgba(196,176,232,0.25)] bg-brand-bg p-8"
              >
                <h3 className="flex items-center gap-2 text-base font-semibold text-brand-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={solution.icon} alt="" className="h-5 w-5 object-contain" />
                  {solution.title}
                </h3>
                <p className="mt-4 text-sm font-light leading-relaxed text-brand-mid">{solution.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

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
        <div
          className="flex flex-col justify-center px-8 py-12 text-white md:px-14 md:py-16"
          style={{ background: "linear-gradient(160deg, #3D5C3D 0%, #5A8C6B 100%)" }}
        >
          <h2 className="display-text text-3xl font-light md:text-4xl">Immersive Wellness Retreats</h2>
          <p className="mt-5 max-w-lg text-sm font-light leading-relaxed text-white/90 md:text-base">
            Recharge with our wellness retreats just outside the city, featuring yoga, meditation, sound healing, and
            organic meals. Enjoy mindfulness activities, nature hikes, and educational sessions on holistic wellness.
          </p>
          <Link
            href="/retreat"
            className="mt-8 inline-flex w-fit rounded-sm bg-white px-8 py-3 text-xs font-medium uppercase tracking-[0.12em] text-brand-violet-deep transition-opacity hover:opacity-95"
          >
            Know More
          </Link>
        </div>
      </section>

      <section className="px-4 py-14 md:py-20 lg:px-8" style={{ background: "#22134A" }}>
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <SectionTitle dark className="mb-4">
              Our Holistic Approach to Wellness
            </SectionTitle>
            <p className="text-sm font-light text-[rgba(196,176,232,0.55)] md:text-base">
              Physical, Mental, and Emotional well-being are the pillars of a balanced, productive life.
            </p>
          </div>
          <div className="mt-12 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[rgba(196,176,232,0.15)]">
              <Image
                src={CORPORATE_IMG.holistic}
                alt="Holistic wellness yoga practice"
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
            <div className="space-y-5">
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
                <div
                  key={pillar.title}
                  className="flex gap-5 rounded-[18px] p-5"
                  style={{ background: "rgba(196,176,232,0.08)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pillar.icon} alt="" className="h-14 w-14 shrink-0 brightness-0 invert opacity-80" />
                  <div>
                    <h4 className="display-text text-lg font-normal text-brand-lavender">{pillar.title}</h4>
                    <p className="mt-1 text-sm font-light text-[rgba(196,176,232,0.55)]">{pillar.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-brand-bg py-14 md:py-20">
        <SectionTitle className="mb-10 px-4">Our Facilitators</SectionTitle>
        <InfiniteMarquee duration={55} trackClassName="gap-0">
          {CORPORATE_FACILITATORS.map((f) => (
            <div key={f.name} className="mx-8 w-36 shrink-0 text-center md:mx-12 md:w-40">
              <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-full border-2 border-[rgba(196,176,232,0.25)] md:h-36 md:w-36">
                <Image src={f.image} alt={f.name} fill className="object-cover" sizes="144px" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-brand-ink">{f.name}</h3>
              <p className="mt-1 text-xs font-light leading-snug text-brand-mid">{f.role}</p>
            </div>
          ))}
        </InfiniteMarquee>
      </section>

      <section
        className="border-y py-14 md:py-20"
        style={{
          background: "#EDE8FB",
          borderColor: "rgba(196,176,232,0.2)"
        }}
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
    </main>
  );
}
