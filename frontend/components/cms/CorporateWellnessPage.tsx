import Link from "next/link";
import type { ReactNode } from "react";

import { ProductRichText } from "@/components/product/ProductRichText";
import type { CmsPage } from "@/lib/cms-types";

type Program = { name: string; subtitle: string; description: string; href?: string };
type Solution = { title: string; description: string };
type Pillar = { title: string; items: string };
type Facilitator = { name: string; role: string };
type Testimonial = { quote: string; author: string; role: string };

export type CorporateWellnessData = {
  heroTitle: string;
  heroSubtitle: string;
  programs: Program[];
  solutions: Solution[];
  retreatsTitle: string;
  retreatsBody: string;
  holisticTitle: string;
  holisticIntro: string;
  pillars: Pillar[];
  facilitators: Facilitator[];
  partnersTitle: string;
  partnersBody: string;
  testimonialsTitle: string;
  testimonials: Testimonial[];
  ctaTitle: string;
  ctaBody: string;
  ctaEmail: string;
  phones: string[];
};

const DEFAULT_DATA: CorporateWellnessData = {
  heroTitle: "Corporate Wellness",
  heroSubtitle:
    "Transform your workplace with curated yoga, meditation, sound healing, and art therapy programs designed for modern teams.",
  programs: [
    {
      name: "SAHYOG",
      subtitle: "Yoga Asanas & Breathwork",
      description:
        "Programs to relieve back and neck pain from sedentary work through tailored yoga and breathwork.",
      href: "/sahyog"
    },
    {
      name: "SARGAM",
      subtitle: "Sound Baths, Drum Circles & Music",
      description:
        "Sessions provide a relaxing auditory experience with therapeutic sound for stress relief and community connection.",
      href: "/sargam"
    },
    {
      name: "SAMATVA",
      subtitle: "Mindfulness & Awareness",
      description:
        "Mindfulness Meditation sessions reduce stress and build team well-being through guided practices.",
      href: "/samatva"
    },
    {
      name: "SAMSARA",
      subtitle: "Art & Expression Therapy",
      description:
        "Creative sessions like art, terrarium gardening, and clay modeling boost stress relief and teamwork.",
      href: "/samsara"
    }
  ],
  solutions: [
    {
      title: "Weekly Program",
      description:
        "Our practitioner visits weekly, offering rotating sessions in yoga, meditation, sound, and art therapy."
    },
    {
      title: "Monthly Program",
      description:
        "Benefit from monthly sessions with a practitioner, keeping experiences fresh and engaging."
    },
    {
      title: "Customized Sessions",
      description: "Choose single or multiple sessions to suit your company's needs."
    }
  ],
  retreatsTitle: "Immersive Wellness Retreats",
  retreatsBody:
    "Recharge with our wellness retreats just outside the city, featuring yoga, meditation, sound healing, and organic meals. Enjoy mindfulness activities, nature hikes, and educational sessions on holistic wellness.",
  holisticTitle: "Our Holistic Approach to Wellness",
  holisticIntro:
    "Physical, Mental, and Emotional well-being are the pillars of a balanced, productive life.",
  pillars: [
    { title: "Physical Wellbeing", items: "Yoga, deskercise, physiotherapy" },
    { title: "Emotional Wellbeing", items: "Art therapy, gratitude journals, laughter yoga" },
    { title: "Mental Wellbeing", items: "Guided meditation, breathwork, counseling" }
  ],
  facilitators: [
    { name: "Arjun", role: "Sound therapist and Multi-instrumentalist" },
    { name: "Priya", role: "Yoganidra Expert" },
    { name: "Chetan", role: "Mudgar Swing" },
    { name: "Tejal Rathod", role: "Sound and meditation therapist" },
    { name: "Saloni", role: "Terrarium workshop" },
    { name: "Vivek", role: "Breathwork and Animal Flow" },
    { name: "Saatvika", role: "EFT and Inner Child Healing" },
    { name: "Xenkat", role: "Drum Circle" },
    { name: "Riya", role: "Yoga" }
  ],
  partnersTitle: "Our Partners in Workplace Wellness",
  partnersBody: "Trusted by leading organizations across India for holistic employee wellness.",
  testimonialsTitle: "Our Wellness in Action",
  testimonials: [
    {
      quote:
        "The Corporate Wellness Program offered by Sarveda for Publicis Groupe was highly appreciated by all our colleagues. The uniqueness of sessions and qualified therapists and facilitators was such a hit that it still gets called out by everyone.",
      author: "Vaishali Ramakrishan",
      role: "Director - Talent and Culture, Publicis Groupe"
    },
    {
      quote:
        "Partnering with Sarveda for our wellness initiatives has been a truly transformative experience. Their holistic approach, rooted in Yoga, Ayurveda, and mindfulness, has brought a profound sense of balance and well-being to our team.",
      author: "Vinod",
      role: "Founder, Red Chariots"
    }
  ],
  ctaTitle: "Get In Touch With Us",
  ctaBody: "Fill up the form and our Team will get back to you within 24 hours.",
  ctaEmail: "care@sarveda.com",
  phones: ["+91 9535975075", "+91 6363608737", "+91 8861568960"]
};

function mergeData(page: CmsPage): CorporateWellnessData {
  const extra = page.extra ?? {};
  return {
    ...DEFAULT_DATA,
    heroTitle: page.title || DEFAULT_DATA.heroTitle,
    ...(typeof extra === "object" && extra !== null ? (extra as Partial<CorporateWellnessData>) : {})
  };
}

type Props = {
  page: CmsPage;
  /** When true, render DB HTML via ProductRichText instead of structured layout */
  useRichContent?: boolean;
};

function SectionHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`font-serif text-2xl font-semibold tracking-tight text-stone-900 md:text-3xl ${className}`}
    >
      {children}
    </h2>
  );
}

export function CorporateWellnessPage({ page, useRichContent = false }: Props) {
  if (useRichContent && page.content?.trim()) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <ProductRichText html={page.content} />
        </div>
      </div>
    );
  }

  const data = mergeData(page);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-stone-200 bg-gradient-to-br from-stone-50 via-amber-50/40 to-stone-100">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-100/30 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-800">Workplace Wellness</p>
          <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl lg:text-6xl">
            {data.heroTitle}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-stone-600">{data.heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href={`mailto:${data.ctaEmail}`}
              className="inline-flex items-center rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-amber-400"
            >
              Enquire Now
            </a>
            <Link
              href="/retreat"
              className="inline-flex items-center rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 transition hover:border-amber-300 hover:bg-amber-50"
            >
              Explore Retreats
            </Link>
          </div>
        </div>
      </section>

      {/* Programs */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading>Curated Wellness Programs</SectionHeading>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {data.programs.map((program) => (
            <article
              key={program.name}
              className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-amber-200 hover:shadow-md"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700">{program.name}</p>
              <h3 className="mt-2 font-serif text-lg font-semibold text-stone-900">{program.subtitle}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-stone-600">{program.description}</p>
              {program.href ? (
                <Link
                  href={program.href}
                  className="mt-4 text-sm font-medium text-amber-800 hover:underline"
                >
                  Learn more →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* Solutions */}
      <section className="border-y border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading>Tailored Wellness Solutions for Every Need</SectionHeading>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {data.solutions.map((solution) => (
              <article
                key={solution.title}
                className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
              >
                <h3 className="font-serif text-lg font-semibold text-stone-900">{solution.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">{solution.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Retreats */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-br from-amber-50 to-stone-50 p-8 md:p-12">
          <SectionHeading>{data.retreatsTitle}</SectionHeading>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-stone-600">{data.retreatsBody}</p>
          <Link
            href="/retreat"
            className="mt-6 inline-flex items-center text-sm font-semibold text-amber-800 hover:underline"
          >
            Know More →
          </Link>
        </div>
      </section>

      {/* Holistic approach */}
      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading>{data.holisticTitle}</SectionHeading>
          <p className="mt-4 max-w-2xl text-base text-stone-600">{data.holisticIntro}</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {data.pillars.map((pillar) => (
              <article
                key={pillar.title}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-6"
              >
                <h3 className="font-serif text-lg font-semibold text-stone-900">{pillar.title}</h3>
                <p className="mt-2 text-sm text-stone-600">{pillar.items}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Facilitators */}
      <section className="border-t border-stone-200 bg-stone-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading>Our Facilitators</SectionHeading>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {data.facilitators.map((f) => (
              <div
                key={f.name}
                className="rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm"
              >
                <p className="font-semibold text-stone-900">{f.name}</p>
                <p className="mt-1 text-sm text-stone-500">{f.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading className="text-center">{data.partnersTitle}</SectionHeading>
        <p className="mx-auto mt-4 max-w-xl text-center text-sm text-stone-600">{data.partnersBody}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
          {["Publicis Groupe", "Red Chariots"].map((partner) => (
            <span
              key={partner}
              className="rounded-full border border-stone-200 bg-stone-50 px-6 py-2 text-sm font-medium text-stone-700"
            >
              {partner}
            </span>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-stone-200 bg-gradient-to-b from-stone-50 to-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <SectionHeading className="text-center">{data.testimonialsTitle}</SectionHeading>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            {data.testimonials.map((t) => (
              <blockquote
                key={t.author}
                className="relative rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
              >
                <span className="absolute left-6 top-4 font-serif text-5xl leading-none text-amber-200">
                  &ldquo;
                </span>
                <p className="relative text-base leading-relaxed text-stone-700">{t.quote}</p>
                <footer className="mt-6 border-t border-stone-100 pt-4">
                  <p className="font-semibold text-stone-900">{t.author}</p>
                  <p className="text-sm text-stone-500">{t.role}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-stone-200 bg-stone-900">
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h2 className="font-serif text-2xl font-semibold text-white md:text-3xl">{data.ctaTitle}</h2>
          <p className="mx-auto mt-4 max-w-lg text-stone-300">{data.ctaBody}</p>
          <a
            href={`mailto:${data.ctaEmail}`}
            className="mt-8 inline-flex items-center rounded-full bg-amber-500 px-8 py-3 text-sm font-semibold text-stone-900 transition hover:bg-amber-400"
          >
            {data.ctaEmail}
          </a>
          <p className="mt-6 text-sm text-stone-400">
            {data.phones.map((phone, i) => (
              <span key={phone}>
                {i > 0 ? " · " : "Phone: "}
                <a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:text-amber-400">
                  {phone}
                </a>
              </span>
            ))}
          </p>
        </div>
      </section>
    </>
  );
}
