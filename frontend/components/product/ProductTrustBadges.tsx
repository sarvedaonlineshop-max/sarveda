import Image from "next/image";

const BADGES = [
  {
    title: "Authentic & Sustainable Craftsmanship",
    body: "Authentic, eco-conscious instruments and accessories, from India and beyond.",
    src: "/pdp/trust-1.png"
  },
  {
    title: "Global Reach",
    body: "Already shipped safe & secure to 50+ countries.",
    src: "/pdp/trust-2.png"
  },
  {
    title: "Trusted Worldwide",
    body: "Favoured by therapists, musicians & wellness practitioners.",
    src: "/pdp/trust-3.png"
  },
  {
    title: "Secure Payments",
    body: "100% Encrypted payments via trusted gateways.",
    src: "/pdp/trust-4.png"
  }
];

export function ProductTrustBadges() {
  return (
    <section aria-label="Why shop with Sarveda" className="border-t border-brand-cream-dark pt-6">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-5">
        {BADGES.map((badge) => (
          <div key={badge.title} className="flex flex-col items-center text-center">
            <div className="relative flex h-14 w-16 items-center justify-center">
              <Image
                src={badge.src}
                alt=""
                fill
                className="object-contain"
                sizes="64px"
                unoptimized
              />
            </div>
            <h3 className="mt-2 font-sans text-[13px] font-bold leading-snug text-brand-ink sm:text-sm">
              {badge.title}
            </h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-muted sm:text-xs">{badge.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
