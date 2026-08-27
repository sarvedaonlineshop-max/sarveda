"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { SectionFlourish } from "@/components/brand/SectionFlourish";

/**
 * Homepage section 3 — “Explore our range of Instruments”
 * 12 category cards · stronger in-view shadow + image zoom (and on hover)
 */

type Category = {
  key: string;
  name: string;
  href: string;
  image: string;
  Icon: () => React.ReactNode;
};

function IconBowl() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <path d="M6 16c1.5 7 5.5 11 10 11s8.5-4 10-11H6Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 16h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 14l5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="19.5" cy="5.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

function IconGong() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <path d="M8 6h16M10 6v4M22 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="18" r="8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="18" r="3.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="16" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function IconHandpan() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <ellipse cx="16" cy="18" rx="11" ry="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 18c2-6 6-10 11-10s9 4 11 10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="14" r="1.4" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="16" r="1.1" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="21" cy="16" r="1.1" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function IconRattle() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <ellipse cx="12" cy="11" rx="6" ry="7" stroke="currentColor" strokeWidth="1.5" transform="rotate(-35 12 11)" />
      <path d="M15 16l7 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="22.5" cy="27" r="1.4" fill="currentColor" />
      <path d="M8 10h7" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    </svg>
  );
}

function IconTuningFork() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <path d="M11 4v12M17 4v12M11 16h6M14 16v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 8c2 1.5 3 3.5 3 6M23 6c2.5 2 4 5 4 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconPercussion() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <ellipse cx="16" cy="9" rx="8" ry="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 9v10c0 2 3.5 4 8 4s8-2 8-4V9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 12c1.5 1 3.5 1.5 6 1.5s4.5-.5 6-1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    </svg>
  );
}

function IconShamanic() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <circle cx="15" cy="15" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="15" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M22 22l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="27.5" cy="27.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

function IconChimes() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <path d="M6 6h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 6v16M14 6v20M18 6v14M22 6v18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconWind() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <path d="M7 24L22 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 20h3M13 16h3M16 12h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="23" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconClassical() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <path d="M10 26c0-8 2-14 6-18 4 4 6 10 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="16" cy="26" rx="7" ry="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13 14h6M12 18h8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconKids() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12.5" cy="14" r="1.2" fill="currentColor" />
      <circle cx="19.5" cy="14" r="1.2" fill="currentColor" />
      <path d="M12 20c1.2 1.5 2.8 2.2 4 2.2s2.8-.7 4-2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconYoga() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0 text-brand-gold" fill="none" aria-hidden>
      <rect x="6" y="10" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 10V8a2 2 0 012-2h10a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 16h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const CATEGORIES: Category[] = [
  {
    key: "singing-bowls",
    name: "Singing Bowls & Bells",
    href: "/product-category/singing-bowls-bells",
    image: "/images/home/instruments/singing-bowls.png",
    Icon: IconBowl
  },
  {
    key: "gongs",
    name: "Gongs",
    href: "/product-category/gongs-musical-instruments",
    image: "/images/home/instruments/gongs.png",
    Icon: IconGong
  },
  {
    key: "handpans",
    name: "Handpans & Tongue Drums",
    href: "/product-category/handpans-tongue-drum",
    image: "/images/home/instruments/handpans.png",
    Icon: IconHandpan
  },
  {
    key: "rattles",
    name: "Rattles & Shakers",
    href: "/product-category/rattles-shakers",
    image: "/images/home/instruments/rattles-shakers.jpg",
    Icon: IconRattle
  },
  {
    key: "tuning-forks",
    name: "Tuning Forks",
    href: "/product-category/tuning-forks",
    image: "/images/home/instruments/tuning-forks.png",
    Icon: IconTuningFork
  },
  {
    key: "percussion",
    name: "Percussion",
    href: "/product-category/percussion",
    image: "/images/home/instruments/percussion.png",
    Icon: IconPercussion
  },
  {
    // No dedicated category in the shop tree — open product results via search.
    key: "shamanic",
    name: "Shamanic Instruments",
    href: "/shop?q=shamanic",
    image: "/images/home/instruments/shamanic.png",
    Icon: IconShamanic
  },
  {
    key: "chimes",
    name: "Chimes",
    href: "/product-category/chimes",
    image: "/images/home/instruments/chimes.png",
    Icon: IconChimes
  },
  {
    key: "wind",
    name: "Wind Instruments",
    href: "/product-category/wind",
    image: "/images/home/instruments/wind.png",
    Icon: IconWind
  },
  {
    key: "indian-classical",
    name: "Indian Classical",
    href: "/product-category/indian-classical",
    image: "/images/home/instruments/indian-classical.png",
    Icon: IconClassical
  },
  {
    key: "kids",
    name: "Kids Instruments",
    href: "/product-category/kids",
    image: "/images/home/instruments/kids.png",
    Icon: IconKids
  },
  {
    key: "yoga",
    name: "Yoga / Meditation Accessories",
    href: "/product-category/yoga-and-meditation",
    image: "/images/home/instruments/yoga-meditation.png",
    Icon: IconYoga
  }
];

export function HomeInstrumentCategories() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.22, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="bg-white" aria-labelledby="home-instruments-heading">
      <div className="page-shell py-14 md:py-16 lg:py-20">
        <div className="text-center">
          <h2
            id="home-instruments-heading"
            className="font-serif text-[1.85rem] font-semibold tracking-tight sm:text-4xl md:text-[2.45rem]"
          >
            <span style={{ color: "#166D46" }}>Explore our range of</span>{" "}
            <span className="text-brand-gold">Instruments</span>
          </h2>
          <SectionFlourish />
          <p className="mx-auto mt-3 max-w-3xl text-[0.95rem] text-[#4a453c] sm:text-base">
            Authentic instruments &amp; accessories for sound healing, music, yoga,
            and conscious living
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 md:mt-12 md:grid-cols-3 lg:grid-cols-6 lg:gap-5">
          {CATEGORIES.map(({ key, name, href, image, Icon }, index) => (
            <li
              key={key}
              className={`transition-[transform,opacity] duration-700 ease-out ${
                inView ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
              style={{ transitionDelay: inView ? `${Math.min(index, 8) * 55}ms` : "0ms" }}
            >
              <Link
                href={href}
                className={`group flex h-full flex-col overflow-hidden rounded-xl border border-brand-cream-dark/80 bg-white transition-[box-shadow,transform] duration-500 ease-out hover:-translate-y-1.5 hover:shadow-[0_18px_40px_rgba(16,32,26,0.18)] ${
                  inView ? "shadow-[0_10px_28px_rgba(16,32,26,0.12)]" : "shadow-card"
                }`}
              >
                <div className="relative aspect-[5/4] overflow-hidden bg-brand-cream">
                  <Image
                    src={image}
                    alt={name}
                    fill
                    sizes="(max-width: 768px) 45vw, (max-width: 1024px) 30vw, 13vw"
                    className={`object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.12] ${
                      inView ? "scale-[1.06]" : "scale-100"
                    }`}
                  />
                </div>
                <div className="flex min-h-[3.25rem] items-center gap-2 border-t border-brand-cream-dark/70 px-2.5 py-2.5 sm:min-h-[3.5rem] sm:px-3">
                  <Icon />
                  <span className="min-w-0 flex-1 text-[0.78rem] font-medium leading-snug text-brand-ink sm:text-sm">
                    {name}
                  </span>
                  <span className="shrink-0 text-brand-gold transition-transform group-hover:translate-x-1" aria-hidden>
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 text-center md:mt-12">
          <Link
            href="/shop"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold tracking-wide text-white transition-colors hover:brightness-95"
            style={{ backgroundColor: "#166D46" }}
          >
            Explore Our Store
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
