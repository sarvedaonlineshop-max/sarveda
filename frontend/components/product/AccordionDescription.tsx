"use client";

import { useState } from "react";

import { decodeHtmlEntities, htmlToPlainText, sanitizeProductHtml } from "@/lib/sanitize-html";

type Item = {
  id: string;
  title: string;
  content: string;
};

type Props = {
  items: Item[];
};

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
        <ul className="border-t border-brand-cream-dark/60 px-4 pb-4 pt-3 text-sm leading-relaxed text-brand-ink/75">
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
        className="rich-features border-t border-brand-cream-dark/60 px-4 pb-4 pt-3 text-sm leading-relaxed text-brand-ink/75 prose prose-stone max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-headings:font-serif prose-headings:text-brand-ink [&_.sarveda-acc-p]:my-2 [&_.sarveda-acc-ul]:my-2 [&_.sarveda-acc-li]:my-1"
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
    );
  }

  return (
    <div className="border-t border-brand-cream-dark/60 px-4 pb-4 pt-3 text-sm leading-relaxed whitespace-pre-wrap text-brand-ink/75">
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
              className="flex min-h-[52px] w-full cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left font-serif font-medium text-brand-ink transition-colors hover:bg-brand-cream"
            >
              <span>{item.title}</span>
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
