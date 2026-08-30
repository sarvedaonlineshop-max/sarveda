"use client";

import Image from "next/image";

import { SectionFlourish } from "@/components/brand/SectionFlourish";
import { PAYPAL_PARTNER_LOGO } from "@/lib/corporate-wellness-data";

/**
 * CSS marquee partner rail — continuous linear loop (no RAF wrap jump at the seam).
 * Two identical sequences; each has trailing gap so -50% is seamless.
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
        draggable={false}
      />
    </div>
  );
}

function PartnerSequence({ suffix }: { suffix: string }) {
  return (
    <div
      className="flex shrink-0 items-center gap-6 pr-6 sm:gap-10 sm:pr-10"
      aria-hidden={suffix !== "a"}
    >
      {PARTNERS.map((p) => (
        <PartnerLogo key={`${suffix}-${p.alt}`} partner={p} />
      ))}
    </div>
  );
}

export function HomeTrustedPartners() {
  return (
    <section className="bg-white pb-14 pt-4 md:pb-16 md:pt-6" aria-labelledby="home-partners-heading">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes sarveda-partners-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        .sarveda-partners-track {
          display: flex;
          width: max-content;
          animation: sarveda-partners-marquee 48s linear infinite;
          will-change: transform;
        }
        .sarveda-partners-viewport:hover .sarveda-partners-track,
        .sarveda-partners-viewport:focus-within .sarveda-partners-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .sarveda-partners-track { animation: none; }
        }
      `}} />
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
          <div
            className="sarveda-partners-viewport overflow-hidden px-2 py-4 sm:px-4"
            style={{ touchAction: "pan-y" }}
          >
            <div className="sarveda-partners-track">
              <PartnerSequence suffix="a" />
              <PartnerSequence suffix="b" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
