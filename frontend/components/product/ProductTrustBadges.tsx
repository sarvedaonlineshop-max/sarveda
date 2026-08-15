/** Four-column authenticity strip shown below Add to cart on every PDP. */

const BADGES = [
  {
    title: "Authentic & Sustainable Craftsmanship",
    body: "Authentic, eco-conscious instruments and accessories, from India and beyond.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
        <ellipse cx="24" cy="28" rx="14" ry="8" fill="none" stroke="#b98a3e" strokeWidth="2.2" />
        <ellipse cx="24" cy="26" rx="10" ry="5.5" fill="none" stroke="#1c352a" strokeWidth="1.6" />
        <path d="M14 27c2-6 6-16 10-16s8 10 10 16" fill="none" stroke="#b98a3e" strokeWidth="2" strokeLinecap="round" />
        <path d="M32 32l8 10" stroke="#1c352a" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M38.5 39.5h5.5" stroke="#b98a3e" strokeWidth="2" strokeLinecap="round" />
        <path d="M22 12l1.2 2.4 2.6.3-2 1.8.6 2.6L22 18.4 19.6 19.1l.6-2.6-2-1.8 2.6-.3Z" fill="#b98a3e" />
      </svg>
    )
  },
  {
    title: "Global Reach",
    body: "Already shipped safe & secure to 50+ countries.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
        <circle cx="24" cy="24" r="11" fill="none" stroke="#b98a3e" strokeWidth="2.2" />
        <ellipse cx="24" cy="24" rx="5.5" ry="11" fill="none" stroke="#1c352a" strokeWidth="1.5" />
        <path d="M13 24h22M16 18.5h16M16 29.5h16" fill="none" stroke="#1c352a" strokeWidth="1.4" />
        <ellipse cx="24" cy="24" rx="18" ry="8" fill="none" stroke="#b98a3e" strokeWidth="1.6" transform="rotate(-18 24 24)" />
        <ellipse cx="24" cy="24" rx="18" ry="8" fill="none" stroke="#1c352a" strokeWidth="1.3" transform="rotate(28 24 24)" />
      </svg>
    )
  },
  {
    title: "Trusted Worldwide",
    body: "Favoured by therapists, musicians & wellness practitioners.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
        <path
          d="M24 8.5c4.2 3.2 8.8 4.6 14 4.6v11.2c0 9.2-6.2 14.8-14 17.7-7.8-2.9-14-8.5-14-17.7V13.1c5.2 0 9.8-1.4 14-4.6Z"
          fill="none"
          stroke="#b98a3e"
          strokeWidth="2.1"
        />
        <path
          d="M24 18.5c-3.4 3.1-7.5 1.2-7.5 4.8 0 4.2 7.5 8.2 7.5 8.2s7.5-4 7.5-8.2c0-3.6-4.1-1.7-7.5-4.8Z"
          fill="#1c352a"
        />
        <circle cx="34" cy="34" r="6.2" fill="#b98a3e" />
        <path d="M31.4 34.1l1.7 1.7 3.5-3.6" fill="none" stroke="#fffdf7" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    title: "Secure Payments",
    body: "100% Encrypted payments via trusted gateways.",
    icon: (
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
        <rect x="14" y="8" width="16" height="26" rx="2.5" fill="none" stroke="#1c352a" strokeWidth="2" />
        <rect x="17" y="12" width="10" height="14" rx="1" fill="none" stroke="#b98a3e" strokeWidth="1.6" />
        <path d="M20 32.5h4" stroke="#b98a3e" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="20" y="26" width="20" height="13" rx="2" fill="#b98a3e" />
        <path d="M23 31.5h8M23 34.5h5" stroke="#fffdf7" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="35.5" cy="32.5" r="2" fill="#1c352a" />
      </svg>
    )
  }
];

export function ProductTrustBadges() {
  return (
    <section aria-label="Why shop with Sarveda" className="border-t border-brand-cream-dark pt-6">
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-5">
        {BADGES.map((badge) => (
          <div key={badge.title} className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center">{badge.icon}</div>
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
