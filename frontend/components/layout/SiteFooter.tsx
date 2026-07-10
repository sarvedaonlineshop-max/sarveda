import Link from "next/link";

import { SarvedaLogo } from "@/components/brand/SarvedaLogo";
import { whatsAppSiteUrl } from "@/lib/enquiry";

const footerLinks = {
  explore: [
    { label: "About",        href: "/about"     },
    { label: "Shop All",     href: "/shop"      },
    { label: "Courses", href: "/courses" },
    { label: "Events", href: "/events" },
    { label: "Corporate Wellness", href: "/corporate-wellness" },
    { label: "Insights", href: "/insights" },
    { label: "Sound Healing", href: "/product-category/sound-musical-instruments" },
    { label: "Ayurveda", href: "/product-category/ayurveda-herbs" },
    { label: "Yoga & Meditation", href: "/product-category/yoga-meditation" },
  ],
  support: [
    { label: "Track Order",  href: "/my-account" },
    { label: "My Account",   href: "/my-account" },
    { label: "Search",       href: "/search"     },
    { label: "Contact Us",   href: "mailto:hello@sarveda.com" },
  ],
  legal: [
    { label: "Privacy Policy",    href: "/privacy"  },
    { label: "Terms of Service",  href: "/terms"    },
    { label: "Refund Policy",     href: "/refunds"  },
    { label: "Shipping Policy",   href: "/shipping" },
  ],
};

const trustBadges = [
  { icon: "🔒", text: "Secure Checkout"   },
  { icon: "✅", text: "100% Authentic"    },
  { icon: "↩️", text: "Easy Returns"      },
  { icon: "🚚", text: "Pan India Shipping" },
];

export function SiteFooter() {
  return (
    <footer className="hidden bg-brand-forest md:block">

      {/* Trust Bar */}
      <div className="border-b border-brand-cream/10">
        <div className="mx-auto grid max-w-7xl grid-cols-4 divide-x divide-brand-cream/10 px-4 sm:px-6 lg:px-8">
          {trustBadges.map((b) => (
            <div key={b.text} className="flex items-center justify-center gap-2.5 py-4">
              <span className="text-xl">{b.icon}</span>
              <span className="text-sm font-medium text-brand-cream/90">{b.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Footer */}
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-5 lg:px-8">

        {/* Brand col */}
        <div className="lg:col-span-2">
          <SarvedaLogo
            iconHeight={44}
            showTagline
            wordmarkClassName="font-serif text-3xl italic text-brand-cream"
            taglineClassName="mt-0.5 text-xs tracking-[0.22em] text-brand-gold"
          />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-brand-cream/70">
            Authentic yoga, Ayurveda, and sound healing products — curated with care for practitioners
            across India and worldwide. Every piece chosen for depth of practice.
          </p>

          {/* Social Links */}
          <div className="mt-6 flex gap-3">
            {[
              { label:"Instagram", href:"https://instagram.com/sarveda",  d:"M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zM12 7a5 5 0 110 10A5 5 0 0112 7zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm5.25-.75a.875.875 0 110 1.75.875.875 0 010-1.75z" },
              { label:"YouTube",   href:"https://youtube.com/@sarveda",   d:"M21.8 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2.1-.9C16.1 5 12 5 12 5s-4.1 0-6.9.1c-.4 0-1.3.1-2.1.9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.3.9C6.8 19 12 19 12 19s4.1 0 6.9-.2c.4 0 1.3-.1 2.1-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM9.8 14.5v-5.1l5.7 2.6-5.7 2.5z" },
              { label:"WhatsApp",  href: whatsAppSiteUrl(),     d:"M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm-1.062 14.853c-.883-.07-2.308-.574-3.395-1.66-1.088-1.088-1.592-2.513-1.661-3.396-.07-.883.244-1.766.767-2.29l.523-.522c.14-.14.349-.14.489 0l1.4 1.4c.14.14.14.349 0 .489l-.662.662c-.21.21-.245.523-.105.767.35.628.84 1.153 1.468 1.503.244.14.558.105.768-.105l.662-.662c.14-.14.35-.14.489 0l1.4 1.4c.14.14.14.35 0 .49l-.523.522c-.489.49-1.33.821-2.22.402z" },
            ].map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-cream/15 text-brand-cream/70 transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d={s.d} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        {/* Explore */}
        <div>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Explore</p>
          <ul className="space-y-2.5">
            {footerLinks.explore.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="text-sm text-brand-cream/70 transition-colors hover:text-brand-gold">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Support */}
        <div>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Support</p>
          <ul className="space-y-2.5">
            {footerLinks.support.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="text-sm text-brand-cream/70 transition-colors hover:text-brand-gold">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Legal */}
        <div>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Legal</p>
          <ul className="space-y-2.5">
            {footerLinks.legal.map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="text-sm text-brand-cream/70 transition-colors hover:text-brand-gold">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t border-brand-cream/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-5 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-xs text-brand-cream/50">
            © {new Date().getFullYear()} Sarveda. All rights reserved. Made with 🙏 in India.
          </p>
          {/* Payment methods */}
          <div className="flex items-center gap-2 text-brand-cream/50">
            <span className="text-xs tracking-wide">We accept</span>
            {["Razorpay","UPI","Visa","Mastercard","Stripe","PayPal"].map((p) => (
              <span key={p} className="rounded border border-brand-cream/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-cream/60">
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
