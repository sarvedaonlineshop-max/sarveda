"use client";

import { useState } from "react";

type Props = {
  url: string;
  title: string;
};

export function InsightShareBar({ url, title }: Props) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const iconBtn =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-brand-cream-dark bg-white text-brand-forest transition-colors hover:border-brand-gold hover:text-brand-gold";

  return (
    <div className="border-t border-brand-cream-dark pt-8 text-center">
      <p className="font-sans text-sm font-semibold text-brand-ink">Share this article:</p>
      <ul className="mt-4 flex items-center justify-center gap-3">
        <li>
          <a
            href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on WhatsApp"
            className={iconBtn}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M12.04 2C6.58 2 2.15 6.36 2.15 11.72c0 1.95.52 3.78 1.43 5.38L2 22l5.1-1.52a10.1 10.1 0 004.94 1.26h.01c5.46 0 9.89-4.36 9.89-9.72C21.94 6.36 17.5 2 12.04 2zm5.76 13.86c-.24.67-1.4 1.23-1.93 1.31-.5.07-1.12.1-1.81-.11-.42-.13-.96-.31-1.65-.61-2.9-1.26-4.79-4.18-4.94-4.37-.14-.19-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.45.27-.29.59-.36.79-.36h.57c.18 0 .42-.07.66.5.24.59.82 2.01.89 2.16.07.14.12.32.02.51-.1.19-.14.32-.29.49-.14.17-.31.38-.44.51-.14.14-.29.29-.12.56.16.27.73 1.2 1.56 1.94 1.07.96 1.97 1.26 2.25 1.4.27.14.43.12.59-.07.16-.19.68-.79.86-1.06.18-.27.36-.22.61-.13.24.09 1.55.73 1.81.86.27.14.45.2.51.31.07.1.07.61-.17 1.28z" />
            </svg>
          </a>
        </li>
        <li>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on Facebook"
            className={iconBtn}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z" />
            </svg>
          </a>
        </li>
        <li>
          <button type="button" onClick={() => void copyLink()} aria-label="Copy link" className={iconBtn}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" strokeLinecap="round" />
              <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07" strokeLinecap="round" />
            </svg>
          </button>
        </li>
      </ul>
      {copied ? <p className="mt-2 text-xs text-brand-sage">Link copied</p> : null}
    </div>
  );
}
