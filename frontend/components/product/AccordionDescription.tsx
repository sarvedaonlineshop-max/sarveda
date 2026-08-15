"use client";

import { useState, type ReactNode } from "react";

import { decodeHtmlEntities, htmlToPlainText, sanitizeProductHtml } from "@/lib/sanitize-html";

type Item = {
  id: string;
  title: string;
  content: string;
};

type Props = {
  items: Item[];
};

function AccordionHeaderIcon({ title }: { title: string }) {
  const t = title.toLowerCase();
  let icon: ReactNode;

  if (/key\s*feature|highlight|spec/.test(t)) {
    icon = (
      <>
        <path d="M12 3l2.1 6.3H21l-5.4 3.9 2.1 6.3L12 16.6 6.3 19.5l2.1-6.3L3 9.3h6.9Z" />
      </>
    );
  } else if (/how to use|instruction|guide/.test(t) && !/care/.test(t)) {
    icon = (
      <>
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </>
    );
  } else if (/how to play|play|sound|music/.test(t)) {
    icon = (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    );
  } else if (/health|benefit|wellness|healing/.test(t)) {
    icon = (
      <>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </>
    );
  } else if (/care|clean|maintain/.test(t)) {
    icon = (
      <>
        <path d="M12 22a7 7 0 006.26-11.13L12 2 5.74 10.87A7 7 0 0012 22z" />
      </>
    );
  } else if (/ship|return|deliver/.test(t)) {
    icon = (
      <>
        <path d="M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 001-1v-3.65a1 1 0 00-.22-.62l-3.48-4.35A1 1 0 0017.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </>
    );
  } else if (/about|sarveda|brand/.test(t)) {
    icon = (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>
    );
  } else if (/dimension|size|weight|measure/.test(t)) {
    icon = (
      <>
        <path d="M21.3 15.3a2.4 2.4 0 000-3.4L16 6.7a2.4 2.4 0 00-3.4 0L2.7 16.6a2.4 2.4 0 000 3.4l4.6 4.6a2.4 2.4 0 003.4 0Z" />
        <path d="M14.5 12.5l-5 5" />
      </>
    );
  } else if (/include|what.?s in|contents|package/.test(t)) {
    icon = (
      <>
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      </>
    );
  } else {
    icon = (
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8Z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
        <path d="M10 9H8" />
      </>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-brand-gold"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icon}
    </svg>
  );
}

function RichContent({ html, title }: { html: string; title?: string }) {
  const cleaned = sanitizeProductHtml(html);
  const looksHtml = /<[a-z][\s\S]*>/i.test(cleaned.trim());

  if (title && /key\s*features?/i.test(title)) {
    const lines = htmlToPlainText(cleaned)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length > 0) {
      return (
        <ul className="border-t border-brand-cream-dark/60 px-4 pb-4 pt-3 text-base leading-relaxed text-brand-ink/80">
          {lines.map((line, i) => (
            <li key={i} className="relative py-1 pl-7">
              <svg
                viewBox="0 0 24 24"
                className="absolute left-0 top-[0.45em] h-4 w-4 text-brand-gold"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              {line}
            </li>
          ))}
        </ul>
      );
    }
  }

  if (looksHtml) {
    return (
      <div
        className="accordion-rich rich-features border-t border-brand-cream-dark/60 px-4 pb-4 pt-3 text-base leading-relaxed text-brand-ink/80 prose prose-stone max-w-none prose-p:my-1.5 prose-ul:my-2 prose-li:my-1 prose-headings:font-sans prose-headings:font-bold prose-headings:text-brand-ink [&_.sarveda-acc-p]:my-1.5 [&_.sarveda-acc-ul]:my-2 [&_.sarveda-acc-li]:my-1"
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
    );
  }

  return (
    <div className="border-t border-brand-cream-dark/60 px-4 pb-4 pt-3 text-base leading-relaxed whitespace-pre-wrap text-brand-ink/80">
      {decodeHtmlEntities(cleaned)}
    </div>
  );
}

export function AccordionDescription({ items }: Props) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-brand-cream-dark/60 rounded-2xl border border-brand-cream-dark bg-white shadow-card">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id} className="group">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId((current) => (current === item.id ? null : item.id))}
              className="flex min-h-[52px] w-full cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left font-sans text-base font-bold text-[#108967] transition-colors hover:bg-brand-cream"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <AccordionHeaderIcon title={item.title} />
                <span>{item.title}</span>
              </span>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 shrink-0 text-brand-gold transition-transform ${open ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {open ? <RichContent html={item.content} title={item.title} /> : null}
          </div>
        );
      })}
    </div>
  );
}
