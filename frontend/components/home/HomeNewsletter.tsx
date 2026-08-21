"use client";

import Image from "next/image";
import { FormEvent, useEffect, useId, useRef, useState } from "react";

import { SectionFlourish } from "@/components/brand/SectionFlourish";
import { getApiBase } from "@/lib/api";

function NewsletterConfirmModal({
  open,
  email,
  alreadySubscribed,
  onClose
}: {
  open: boolean;
  email: string;
  alreadySubscribed: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-brand-night/55 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-brand-gold/25 bg-gradient-to-b from-brand-ivory via-white to-brand-cream shadow-[0_24px_60px_rgba(16,32,26,0.28)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gold-gradient" aria-hidden />
        <div className="px-7 pb-8 pt-9 text-center sm:px-9">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-forest/95 text-brand-gold shadow-gold">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden>
              <path
                d="M5 12.5 9.5 17 19 7.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2
            id={titleId}
            className="mt-5 font-serif text-[1.65rem] font-semibold tracking-tight text-brand-ink sm:text-[1.85rem]"
          >
            {alreadySubscribed ? "You're already with us" : "Welcome to the community"}
          </h2>
          <SectionFlourish />
          <p className="mt-4 text-sm leading-relaxed text-brand-ink/75 sm:text-[0.95rem]">
            {alreadySubscribed ? (
              <>
                <span className="font-medium text-brand-ink">{email}</span> is already on our
                inspiration list. We&apos;ll keep sharing instruments, workshops and thoughtful
                updates — no spam.
              </>
            ) : (
              <>
                Thank you. We&apos;ve added{" "}
                <span className="font-medium text-brand-ink">{email}</span> to the Sarveda circle.
                Expect occasional notes on new instruments, workshops, retreats and journal pieces.
              </>
            )}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="mt-7 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#108967] px-6 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-[#0d6f54] sm:w-auto sm:min-w-[220px]"
          >
            Continue exploring
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function HomeNewsletter() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const value = email.trim().toLowerCase();
    if (!value) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: value, source: "homepage" })
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: { alreadySubscribed?: boolean };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Could not join right now. Please try again.");
      }
      setConfirmedEmail(value);
      setAlreadySubscribed(Boolean(json.data?.alreadySubscribed));
      setModalOpen(true);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="newsletter"
      className="scroll-mt-24 overflow-hidden bg-[#f9f6f1] pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:mb-0 md:pb-0"
      aria-labelledby="home-newsletter-heading"
    >
      <div className="grid w-full items-stretch lg:grid-cols-2">
        <div className="min-w-0 px-[5%] py-14 md:px-[10%] md:py-16 lg:mx-auto lg:w-full lg:max-w-[720px] lg:py-20 lg:pl-[10%] lg:pr-8 xl:pr-12">
          <h2
            id="home-newsletter-heading"
            className="font-serif text-[1.85rem] font-semibold leading-[1.12] tracking-tight sm:text-[2.2rem] md:text-[2.45rem]"
          >
            <span style={{ color: "#166D46" }}>A Little Inspiration,</span>
            <br />
            <span className="italic text-[#a67c52]">Once in a While.</span>
          </h2>

          <p className="mt-4 max-w-[26rem] text-[0.92rem] leading-[1.55] text-[#4a453c] sm:text-[0.98rem]">
            Be the first to hear about new instruments, workshops, retreats and thoughtful articles.
            No spam. Just meaningful updates.
          </p>

          <form className="mt-7 max-w-xl" onSubmit={(e) => void onSubmit(e)} noValidate>
            <label htmlFor="home-newsletter-email" className="sr-only">
              Email address
            </label>
            <div className="flex min-h-[52px] max-w-xl items-center gap-2 rounded-full border border-[#e8e0d4] bg-white py-1.5 pl-4 pr-1.5 shadow-none transition-[box-shadow,border-color] focus-within:border-[#a67c52]/45 focus-within:shadow-[0_0_0_3px_rgba(166,124,82,0.16)]">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0 text-[#9a9184]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4V6zm0 0 8 7 8-7" />
              </svg>
              <input
                id="home-newsletter-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                placeholder="Enter your email address"
                className="newsletter-email-input min-w-0 flex-1 bg-transparent py-2 text-sm text-brand-ink outline-none ring-0 placeholder:text-[#b0a89c] focus:outline-none focus:ring-0 focus-visible:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold tracking-wide text-white transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a67c52]/55 disabled:cursor-wait disabled:opacity-70 sm:px-5 sm:text-sm"
                style={{ backgroundColor: "#166D46" }}
              >
                {loading ? "Joining…" : "Join the Community"}
                {!loading ? <span aria-hidden>→</span> : null}
              </button>
            </div>
          </form>

          {error ? (
            <p className="mt-3 text-sm text-brand-terra" role="alert">
              {error}
            </p>
          ) : null}

          <p className="mt-3.5 flex items-center gap-1.5 text-[0.7rem] text-[#8a8278] sm:text-xs">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden
            >
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
            </svg>
            We respect your privacy. Unsubscribe anytime.
          </p>
        </div>

        {/* Full-bleed to the right edge — avoids dark photo edge reading as a black line. */}
        <div className="relative min-h-[240px] sm:min-h-[300px] lg:min-h-full lg:self-stretch">
          <Image
            src="/images/home/newsletter-lifestyle.jpg"
            alt="Sarveda notebook, singing bowl and pen arranged for mindful journaling"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-center"
            priority={false}
          />
        </div>
      </div>

      <NewsletterConfirmModal
        open={modalOpen}
        email={confirmedEmail}
        alreadySubscribed={alreadySubscribed}
        onClose={() => setModalOpen(false)}
      />
    </section>
  );
}
