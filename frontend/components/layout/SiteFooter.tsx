import Link from "next/link";

import { SarvedaLogo } from "@/components/brand/SarvedaLogo";

const quickLinks = [
  { label: "Store", href: "/shop" },
  { label: "Courses", href: "/courses" },
  { label: "Workshops & Events", href: "/events" },
  { label: "Corporate Wellness", href: "/corporate-wellness" },
  { label: "Journal", href: "/insights" },
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" }
];

const customerService = [
  { label: "Track My Order", href: "/my-account" },
  { label: "Login / Sign Up", href: "/login" },
  { label: "Shipping & Delivery", href: "/shipping" },
  { label: "Returns & Exchanges", href: "/refunds" },
  { label: "FAQs", href: "/contact" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" }
];

const values = [
  {
    title: "Authentic & Handpicked",
    body: "Carefully sourced for quality and purity",
    icon: (
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3zM9.5 12l2 2 4-4" />
    )
  },
  {
    title: "Ethical & Sustainable",
    body: "Conscious choices for a better world",
    icon: <path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10zM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  },
  {
    title: "Ships Worldwide",
    body: "Delivered with care across borders",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
      </>
    )
  },
  {
    title: "Made with Care",
    body: "Rooted in tradition, crafted with love",
    icon: (
      <path d="M12 21s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 11c0 5.5-7 10-7 10z" />
    )
  }
];

const social = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/sarveda.shaala/",
    d: "M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zM12 7a5 5 0 110 10A5 5 0 0112 7zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm5.25-.75a.875.875 0 110 1.75.875.875 0 010-1.75z"
  },
  {
    label: "Facebook",
    href: "https://facebook.com/sarveda",
    d: "M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z"
  },
  {
    label: "YouTube",
    href: "https://youtube.com/@sarveda",
    d: "M21.8 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2.1-.9C16.1 5 12 5 12 5s-4.1 0-6.9.1c-.4 0-1.3.1-2.1.9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.3.9C6.8 19 12 19 12 19s4.1 0 6.9-.2c.4 0 1.3-.1 2.1-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM9.8 14.5v-5.1l5.7 2.6-5.7 2.5z"
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/sarveda",
    d: "M6.5 9H3v12h3.5V9zM4.75 3A2.1 2.1 0 102.7 5.1 2.1 2.1 0 004.75 3zM21 21h-3.5v-6.2c0-1.7-.6-2.8-2.1-2.8-1.1 0-1.8.8-2.1 1.5-.1.3-.1.6-.1.9V21H9.8s.05-10.8 0-12H13.3v1.9c.5-.8 1.4-1.9 3.4-1.9 2.5 0 4.3 1.6 4.3 5.1V21z"
  }
];

export function SiteFooter() {
  return (
    <footer className="hidden bg-brand-forest md:block">
      <div className="mx-auto w-[90%] max-w-[1600px] py-14 md:w-[80%]">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr] lg:gap-12">
          {/* Brand */}
          <div>
            <SarvedaLogo
              iconHeight={40}
              wordmarkClassName="font-serif text-2xl tracking-[0.08em] text-brand-cream uppercase"
            />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-gold">
              Sound. Yoga. Conscious Living.
            </p>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-brand-cream/75">
              Sarveda brings together timeless traditions and conscious living through sound,
              yoga and mindful practices. We curate and craft authentic instruments, offer
              transformative learning experiences and design wellness programs for individuals
              and organizations worldwide.
            </p>
            <div className="mt-6 flex gap-2.5">
              {social.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-cream/20 text-brand-cream/80 transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d={s.d} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
              Quicklinks
            </p>
            <ul className="space-y-2.5">
              {quickLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-brand-cream/75 transition-colors hover:text-brand-gold"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
              Customer Service
            </p>
            <ul className="space-y-2.5">
              {customerService.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-brand-cream/75 transition-colors hover:text-brand-gold"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
              Get in Touch
            </p>
            <ul className="space-y-3.5 text-sm text-brand-cream/75">
              <li className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-brand-gold" aria-hidden>
                  ⌖
                </span>
                <span>
                  Sarveda Warehouse, Hebbal Industrial Area, Mysore – 570 016, Karnataka, India.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 text-brand-gold" aria-hidden>
                  ✉
                </span>
                <a href="mailto:care@sarveda.com" className="hover:text-brand-gold">
                  care@sarveda.com
                </a>
              </li>
              <li className="flex gap-2.5">
                <span className="shrink-0 text-brand-gold" aria-hidden>
                  ☎
                </span>
                <a href="tel:+919972238158" className="hover:text-brand-gold">
                  +91 9972238158
                </a>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-brand-gold" aria-hidden>
                  ◷
                </span>
                <span>
                  Mon – Fri: 9:30 AM – 5:30 PM (IST)
                  <br />
                  Sat: 9:30 AM – 1:00 PM (IST)
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-brand-cream/10">
        <div className="mx-auto flex w-[90%] max-w-[1600px] flex-col gap-6 py-6 md:w-[80%] lg:flex-row lg:items-center lg:justify-between">
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
            {values.map((v) => (
              <li key={v.title} className="flex gap-2.5">
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {v.icon}
                </svg>
                <div>
                  <p className="text-xs font-semibold text-brand-cream/90">{v.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-brand-cream/55">{v.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="shrink-0 text-xs text-brand-cream/50 lg:text-right">
            © {new Date().getFullYear()} Sarveda. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
