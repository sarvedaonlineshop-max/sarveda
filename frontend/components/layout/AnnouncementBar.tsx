"use client";

import { InfiniteMarquee } from "@/components/cms/InfiniteMarquee";

const ANNOUNCEMENTS = [
  "💳 Visa · Mastercard · PayPal · Stripe accepted",
  "Use WELCOME5 for 5% off your first order",
  "🌍 Shipping to India · US · UK · Worldwide",
  "🎵 Audio samples on all singing bowls",
];

type Props = {
  /** Collapse when user scrolls (Header only). Instant — no fade/slide. */
  hidden?: boolean;
  /** Tailwind wrapper classes (background, text color, etc.) */
  className?: string;
};

export function AnnouncementBar({ hidden = false, className = "" }: Props) {
  if (hidden) return null;

  return (
    <div
      className={`overflow-hidden bg-brand-forest text-xs font-medium tracking-wide text-brand-gold-pale ${className}`}
    >
      <InfiniteMarquee duration={36} pauseOnHover={false} className="py-2" trackClassName="whitespace-nowrap">
        {ANNOUNCEMENTS.map((msg) => (
          <span key={msg} className="mx-8 shrink-0">
            {msg}
          </span>
        ))}
      </InfiniteMarquee>
    </div>
  );
}
