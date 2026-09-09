import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { aboutPage } from "@/lib/about-content";

const GOLD = "currentColor";

function IconBowl() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#3f4f46]" fill="none" aria-hidden>
      <path d="M8 24c2.2 10 8.2 16 16 16s13.8-6 16-16H8Z" stroke={GOLD} strokeWidth="1.6" />
      <path d="M10 24h28" stroke={GOLD} strokeWidth="1.6" />
      <path d="M21 21l7.5-12" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="29" cy="8" r="1.8" fill={GOLD} />
    </svg>
  );
}

function IconBook() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#3f4f46]" fill="none" aria-hidden>
      <path
        d="M10 12.5c4.5-2 8.5-2 14 0v25c-5.5-2-9.5-2-14 0V12.5Z"
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M24 12.5c4.5-2 8.5-2 14 0v25c-5.5-2-9.5-2-14 0V12.5Z"
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M24 12.5v25" stroke={GOLD} strokeWidth="1.4" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#3f4f46]" fill="none" aria-hidden>
      <circle cx="24" cy="14" r="5" stroke={GOLD} strokeWidth="1.6" />
      <path d="M14 34c1.4-5.5 5-8.5 10-8.5s8.6 3 10 8.5" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="17" r="3.5" stroke={GOLD} strokeWidth="1.4" />
      <path d="M6.5 33c1-3.8 3.2-5.8 6-6.2" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="36" cy="17" r="3.5" stroke={GOLD} strokeWidth="1.4" />
      <path d="M41.5 33c-1-3.8-3.2-5.8-6-6.2" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#3f4f46]" fill="none" aria-hidden>
      <path d="M12 40V14l12-6 12 6v26" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M18 40V22h12v18" stroke={GOLD} strokeWidth="1.5" />
      <path d="M8 40h32" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21 26h2.5M24.5 26H27M21 30h2.5M24.5 30H27M21 34h2.5M24.5 34H27" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconLeaf() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#3f4f46]" fill="none" aria-hidden>
      <path
        d="M14 34c8-14 18-20 26-22-2 10-8 20-20 26-2-1.5-4.5-2.5-6-4Z"
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M18 30c6-5 12-9 18-12" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconCraft() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#3f4f46]" fill="none" aria-hidden>
      <path d="M16 14c0-4 3.5-7 8-7s8 3 8 7c0 6-5 8-8 14-3-6-8-8-8-14Z" stroke={GOLD} strokeWidth="1.6" />
      <path d="M24 28v6" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18 38h12" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M20 34h8" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconCollab() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#3f4f46]" fill="none" aria-hidden>
      <circle cx="16" cy="18" r="5" stroke={GOLD} strokeWidth="1.6" />
      <circle cx="32" cy="18" r="5" stroke={GOLD} strokeWidth="1.6" />
      <circle cx="24" cy="32" r="5" stroke={GOLD} strokeWidth="1.6" />
      <path d="M20 21l4 7M28 21l-4 7M21 18h6" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-[#3f4f46]" fill="none" aria-hidden>
      <path d="M20 34V14l16-4v20" stroke={GOLD} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="16" cy="34" r="4.5" stroke={GOLD} strokeWidth="1.6" />
      <circle cx="32" cy="30" r="4.5" stroke={GOLD} strokeWidth="1.6" />
    </svg>
  );
}

const WHAT_ICONS: Record<string, () => ReactNode> = {
  instruments: IconBowl,
  learning: IconBook,
  experiences: IconPeople,
  organisations: IconBuilding
};

const GUIDE_ICONS: Record<string, () => ReactNode> = {
  quality: IconLeaf,
  craft: IconCraft,
  collaboration: IconCollab,
  curiosity: IconNote
};

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#b98a3e]">{children}</p>
  );
}

function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`font-serif text-[1.85rem] font-semibold leading-tight tracking-[-0.02em] text-[#1c352a] sm:text-[2.15rem] ${className}`}>
      {children}
    </h2>
  );
}

export function AboutPageContent() {
  const { hero, story, whatWeDo, founder, team, guides, journey } = aboutPage;

  return (
    <div className="bg-[#faf5ec] text-[#26251f]">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#efe6d6]">
        <div className="absolute inset-0">
          <Image
            src={hero.image.src}
            alt={hero.image.alt}
            fill
            priority
            className="object-cover object-[70%_center]"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#faf5ec] via-[#faf5ec]/92 to-[#faf5ec]/25 sm:via-[#faf5ec]/88 sm:to-transparent" />
        </div>
        <div className="page-shell relative z-10 py-14 sm:py-16 lg:py-20">
          <div className="max-w-xl">
            <Eyebrow>{hero.eyebrow}</Eyebrow>
            <h1 className="mt-3 font-serif text-[2.8rem] font-semibold leading-[0.95] tracking-[-0.03em] text-[#1c352a] sm:text-[3.5rem] lg:text-[4rem]">
              {hero.title}
            </h1>
            <p className="mt-5 font-serif text-[1.35rem] font-medium leading-snug text-[#1c352a] sm:text-[1.55rem]">
              {hero.tagline}
            </p>
            <div className="mt-5 h-px w-14 bg-[#b98a3e]" />
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[#4f5f56] sm:text-base sm:leading-7">
              {hero.intro}
            </p>
          </div>
        </div>
      </section>

      {/* Our story */}
      <section className="page-shell py-14 sm:py-16 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <div>
            <Eyebrow>{story.eyebrow}</Eyebrow>
            <SectionTitle className="mt-3">{story.title}</SectionTitle>
          </div>
          <div className="space-y-5 text-[15px] leading-relaxed text-[#4f5f56] sm:text-base sm:leading-7">
            {story.paragraphs.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      {/* What we do */}
      <section className="border-y border-[#efe6d6] bg-[#fffdf7]">
        <div className="page-shell py-14 sm:py-16 lg:py-20">
          <div className="text-center">
            <Eyebrow>{whatWeDo.eyebrow}</Eyebrow>
            <div className="mx-auto mt-3 h-px w-12 bg-[#b98a3e]" />
          </div>
          <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {whatWeDo.items.map((item) => {
              const Icon = WHAT_ICONS[item.key];
              return (
                <li key={item.key} className="text-center sm:text-left">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center sm:mx-0">
                    {Icon ? <Icon /> : null}
                  </div>
                  <h3 className="font-serif text-[1.05rem] font-semibold uppercase tracking-[0.04em] text-[#1c352a]">
                    <Link href={item.href} className="transition hover:text-[#b98a3e]">
                      {item.title}
                    </Link>
                  </h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-[#5a6a61]">{item.body}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Founder */}
      <section className="page-shell py-14 sm:py-16 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-[#efe6d6] sm:aspect-[5/4] lg:aspect-[4/5]">
            <Image
              src={founder.image.src}
              alt={founder.image.alt}
              fill
              className="object-cover object-top"
              sizes="(max-width: 1024px) 100vw, 42vw"
            />
          </div>
          <div>
            <Eyebrow>{founder.eyebrow}</Eyebrow>
            <h2 className="mt-3 font-serif text-[2.2rem] font-semibold leading-tight tracking-[-0.02em] text-[#1c352a] sm:text-[2.6rem]">
              {founder.name}
            </h2>
            <p className="mt-2 font-serif text-lg italic text-[#5a6a61]">{founder.role}</p>
            <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-[#4f5f56] sm:text-base sm:leading-7">
              {founder.paragraphs.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </div>
            <p className="mt-6 font-semibold leading-relaxed text-[#1c352a]">{founder.closing}</p>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-y border-[#efe6d6] bg-[#fffdf7]">
        <div className="page-shell py-14 sm:py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
            <div>
              <Eyebrow>{team.eyebrow}</Eyebrow>
              <SectionTitle className="mt-3">{team.title}</SectionTitle>
              <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-[#4f5f56] sm:text-base sm:leading-7">
                {team.paragraphs.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
              </div>
            </div>
            <figure>
              <div className="relative aspect-[16/7] overflow-hidden rounded-sm bg-[#efe6d6]">
                <Image
                  src={team.image.src}
                  alt={team.image.alt}
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 55vw"
                />
              </div>
              <figcaption className="mt-3 text-center text-sm text-[#7d7263]">{team.caption}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* What guides us */}
      <section className="page-shell py-14 sm:py-16 lg:py-20">
        <div className="text-center">
          <Eyebrow>{guides.eyebrow}</Eyebrow>
          <div className="mx-auto mt-3 h-px w-12 bg-[#b98a3e]" />
        </div>
        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {guides.items.map((item) => {
            const Icon = GUIDE_ICONS[item.key];
            return (
              <li key={item.key} className="text-center sm:text-left">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center sm:mx-0">
                  {Icon ? <Icon /> : null}
                </div>
                <h3 className="font-serif text-[1.15rem] font-semibold leading-snug text-[#1c352a]">{item.title}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-[#5a6a61]">{item.body}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Journey CTA */}
      <section className="border-t border-[#efe6d6] bg-[#1c352a]">
        <div className="page-shell flex flex-col gap-8 py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:py-14">
          <div className="max-w-xl">
            <h2 className="font-serif text-[1.85rem] font-semibold leading-tight text-[#fffbf5] sm:text-[2.15rem]">
              {journey.title}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[#d8e5cf] sm:text-base">{journey.body}</p>
          </div>
          <div className="flex w-full max-w-md flex-col gap-3">
            {journey.ctas.map((cta) => (
              <Link
                key={cta.href}
                href={cta.href}
                className="inline-flex min-h-[48px] items-center justify-between gap-3 rounded-sm bg-[#166D46] px-5 text-sm font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-[#1f8558]"
              >
                <span>{cta.label}</span>
                <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
