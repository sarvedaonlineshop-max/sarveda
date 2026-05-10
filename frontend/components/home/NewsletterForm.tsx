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
        className="min-h-[48px] flex-1 rounded-xl border border-stone-700 bg-stone-800 px-4 text-stone-100 placeholder:text-stone-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={done}
        className="min-h-[48px] rounded-xl bg-amber-400 px-8 font-semibold tracking-wide text-stone-900 transition-colors hover:bg-amber-300 disabled:cursor-default disabled:opacity-90"
      >
        {done ? "Thank you" : "Notify me"}
      </button>
    </form>
  );
}
