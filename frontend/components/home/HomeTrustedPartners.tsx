"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";

import { SectionFlourish } from "@/components/brand/SectionFlourish";
import { PAYPAL_PARTNER_LOGO } from "@/lib/corporate-wellness-data";

/**
 * Transform-based partner rail (not overflow scrollLeft) so Safari/iOS keeps auto-rolling.
 * Touch/hover pauses briefly, then resumes without needing a manual drag restart.
 */

const PARTNERS = [
  { src: PAYPAL_PARTNER_LOGO, alt: "PayPal", wide: true },
  { src: "/images/home/partners/publicis-groupe.png", alt: "Publicis Groupe" },
  { src: "/images/home/partners/times-group.png", alt: "The Times Group" },
  { src: "/images/home/partners/veeam.png", alt: "Veeam", wide: true },
  { src: "/images/home/partners/rotary.png", alt: "Rotary", wide: true },
  {
    src: "/images/home/partners/international-yoga-festival.png",
    alt: "International Yoga Festival",
    wide: true
  },
  {
    src: "/images/home/partners/world-peace-festival.png",
    alt: "World Peace Festival Society",
    wide: true
  },
  { src: "/images/home/partners/taj.png", alt: "Taj", wide: true },
  { src: "/images/home/partners/accor.svg", alt: "Accor", wide: true },
  { src: "/images/home/partners/hero-fincorp.png", alt: "Hero FinCorp", wide: true },
  { src: "/images/home/partners/jwm.webp", alt: "JWM", wide: true }
] as const;

const AUTO_SPEED = 0.45;

function PartnerLogo({ partner }: { partner: (typeof PARTNERS)[number] }) {
  const wide = "wide" in partner && partner.wide;
  const isSvg = partner.src.endsWith(".svg");
  return (
    <div
      className={`relative flex h-16 shrink-0 items-center justify-center sm:h-20 ${
        wide ? "w-40 sm:w-52" : "w-28 sm:w-36"
      }`}
    >
      <Image
        src={partner.src}
        alt={partner.alt}
        fill
        sizes="208px"
        unoptimized={isSvg}
        className="object-contain object-center"
      />
    </div>
  );
}

export function HomeTrustedPartners() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const loopWidthRef = useRef(0);
  const pausedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paint = useCallback((value: number) => {
    const track = trackRef.current;
    if (track) track.style.transform = `translate3d(${-value}px, 0, 0)`;
  }, []);

  const applyOffset = useCallback(
    (value: number) => {
      let next = value;
      const loopW = loopWidthRef.current;
      if (loopW > 0) {
        while (next >= loopW) next -= loopW;
        while (next < 0) next += loopW;
      }
      offsetRef.current = next;
      paint(next);
      return next;
    },
    [paint]
  );

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const total = track.scrollWidth;
    loopWidthRef.current = total / 2;
    applyOffset(offsetRef.current);
  }, [applyOffset]);

  useEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);

  const pause = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    pausedRef.current = true;
  }, []);

  const scheduleResume = useCallback((ms = 1600) => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      pausedRef.current = false;
    }, ms);
  }, []);

  useEffect(() => {
    const step = () => {
      if (!pausedRef.current) {
        applyOffset(offsetRef.current + AUTO_SPEED);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [applyOffset]);

  // Keep rolling when tab becomes visible again (Safari often stalls otherwise).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        pausedRef.current = false;
        measure();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [measure]);

  function scrollByDir(dir: -1 | 1) {
    pause();
    applyOffset(offsetRef.current + dir * Math.min(280, (viewportRef.current?.clientWidth ?? 320) * 0.55));
    scheduleResume(2200);
  }

  const display = [...PARTNERS, ...PARTNERS];

  return (
    <section className="bg-white pb-14 pt-4 md:pb-16 md:pt-6" aria-labelledby="home-partners-heading">
      <div className="page-shell">
        <div className="text-center">
          <h2
            id="home-partners-heading"
            className="font-serif text-[1.65rem] font-semibold tracking-tight sm:text-3xl md:text-[2.15rem]"
          >
            <span style={{ color: "#166D46" }}>Trusted by</span>{" "}
            <span className="text-brand-gold">Leading Organizations</span>
          </h2>
          <SectionFlourish />
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[#4a453c] sm:text-[0.95rem]">
            We&apos;re honoured to partner with forward-thinking organizations that value
            well-being, creativity, and meaningful impact.
          </p>
        </div>

        <div className="relative mt-10 md:mt-12">
          <button
            type="button"
            onClick={() => scrollByDir(-1)}
            className="absolute -left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-brand-gold transition hover:text-brand-forest sm:-left-4 md:-left-6"
            aria-label="Scroll partners left"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollByDir(1)}
            className="absolute -right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-brand-gold transition hover:text-brand-forest sm:-right-4 md:-right-6"
            aria-label="Scroll partners right"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div
            ref={viewportRef}
            className="overflow-hidden px-2 py-4 sm:px-4"
            style={{ touchAction: "pan-y" }}
            onPointerEnter={pause}
            onPointerLeave={() => scheduleResume(900)}
            onTouchStart={pause}
            onTouchEnd={() => scheduleResume(1600)}
            onTouchCancel={() => scheduleResume(1600)}
          >
            <div
              ref={trackRef}
              className="flex w-max gap-6 sm:gap-10"
              style={{ transform: "translate3d(0, 0, 0)", willChange: "transform" }}
            >
              {display.map((p, i) => (
                <PartnerLogo key={`${p.alt}-${i}`} partner={p} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
