import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { aboutPage } from "@/lib/about-content";

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
          {/* Static asset — avoid Vercel /_next/image 402 on replaced uploads */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.image.src}
            alt={hero.image.alt}
            className="absolute inset-0 h-full w-full object-cover object-[72%_center]"
            fetchPriority="high"
          />
          {/* Light fade only — photo already softens on the left for text */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#faf5ec]/95 via-[#faf5ec]/55 to-transparent sm:via-[#faf5ec]/40" />
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

      {/* Our story — title + lead left; remaining copy right; leaf graphic far right */}
      <section className="page-shell py-14 sm:py-16 lg:py-20">
        <Eyebrow>{story.eyebrow}</Eyebrow>
        <div className="mt-3 grid items-start gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(7rem,0.28fr)] lg:gap-10 xl:gap-14">
          <div>
            <SectionTitle>{story.title}</SectionTitle>
            <div className="mt-4 h-[3px] w-14 bg-[#b98a3e]" />
            <p className="mt-6 text-[15px] leading-relaxed text-[#4f5f56] sm:text-base sm:leading-7">
              {story.paragraphs[0]}
            </p>
          </div>
          <div className="space-y-5 text-[15px] leading-relaxed text-[#4f5f56] sm:text-base sm:leading-7">
            <p>{story.paragraphs[1]}</p>
            <p>{story.paragraphs[2]}</p>
            <p className="font-serif text-[1.05rem] font-semibold leading-snug text-[#1c352a] sm:text-[1.15rem] sm:leading-relaxed">
              {story.paragraphs[3]}
            </p>
          </div>
          <div className="mx-auto hidden w-full max-w-[11rem] justify-self-end lg:block xl:max-w-[13rem]">
            {/* Static asset — avoid Vercel /_next/image 402 on new uploads */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={story.image.src}
              alt={story.image.alt}
              aria-hidden={story.image.alt ? undefined : true}
              className="h-auto w-full object-contain object-top"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
        {/* Mobile / tablet: show leaf below copy */}
        <div className="mt-10 flex justify-center lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={story.image.src}
            alt=""
            aria-hidden
            className="h-auto w-40 object-contain sm:w-48"
            loading="lazy"
            decoding="async"
          />
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
              return (
                <li key={item.key} className="text-center sm:text-left">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center sm:mx-0 sm:h-[4.5rem] sm:w-[4.5rem]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.icon}
                      alt=""
                      aria-hidden
                      className="h-full w-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
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
          <div className="relative aspect-[3/2] overflow-hidden rounded-sm bg-[#efe6d6] sm:aspect-[5/4] lg:aspect-[4/3]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={founder.image.src}
              alt={founder.image.alt}
              className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
              loading="lazy"
              decoding="async"
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
              <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-[#efe6d6] sm:aspect-[3/2]">
                {/* Local static asset — bypass /_next/image (Vercel optimizer 402 on new uploads). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={team.image.src}
                  alt={team.image.alt}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                  loading="lazy"
                  decoding="async"
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
            return (
              <li key={item.key} className="text-center sm:text-left">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center sm:mx-0 sm:h-16 sm:w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.icon}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
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
