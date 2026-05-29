"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [done, setDone] = useState(false);

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">
        Email
      </label>
      <input
        id="newsletter-email"
        name="email"
        type="email"
        required
        disabled={done}
        placeholder="Your email"
        autoComplete="email"
        className="min-h-[48px] flex-1 rounded-xl border border-[rgba(196,176,232,0.35)] bg-brand-violet-deep px-4 text-brand-lavender placeholder:text-brand-muted focus:border-brand-lavender-mid focus:outline-none focus:ring-2 focus:ring-[rgba(155,130,204,0.35)] disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={done}
        className="min-h-[48px] rounded-xl bg-brand-gold px-8 font-semibold tracking-wide text-brand-ink transition-colors hover:bg-brand-gold-bright disabled:cursor-default disabled:opacity-90"
      >
        {done ? "Thank you" : "Notify me"}
      </button>
    </form>
  );
}
