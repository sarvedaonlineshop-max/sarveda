"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { getApiBase } from "@/lib/api";
import { whatsAppSiteUrl } from "@/lib/enquiry";

const HOME_GREEN = "#166D46";
const STORAGE_HIDDEN = "sarveda-float-widget-hidden";
const STORAGE_POS = "sarveda-float-widget-pos";

const SOCIAL = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/sarvedalife",
    path: "M14 8h3V5h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3l1-3h-4V9c0-.6.4-1 1-1z"
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/sarveda_life/",
    path: "M7.75 2h8.5A5.75 5.75 0 0122 7.75v8.5A5.75 5.75 0 0116.25 22h-8.5A5.75 5.75 0 012 16.25v-8.5A5.75 5.75 0 017.75 2zm0 1.5A4.25 4.25 0 003.5 7.75v8.5A4.25 4.25 0 007.75 20.5h8.5a4.25 4.25 0 004.25-4.25v-8.5A4.25 4.25 0 0016.25 3.5h-8.5zM12 7a5 5 0 110 10A5 5 0 0112 7zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm5.25-.75a.875.875 0 110 1.75.875.875 0 010-1.75z"
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@sarvedalife",
    path: "M21.8 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2.1-.9C16.1 5 12 5 12 5s-4.1 0-6.9.1c-.4 0-1.3.1-2.1.9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.8 2.3.9C6.8 19 12 19 12 19s4.1 0 6.9-.2c.4 0 1.3-.1 2.1-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM9.8 14.5v-5.1l5.7 2.6-5.7 2.5z"
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/14769426/",
    path: "M6.5 9H3v12h3.5V9zM4.75 3A2.1 2.1 0 102.7 5.1 2.1 2.1 0 004.75 3zM21 21h-3.5v-6.2c0-1.7-.6-2.8-2.1-2.8-1.1 0-1.8.8-2.1 1.5-.1.3-.1.6-.1.9V21H9.8s.05-10.8 0-12H13.3v1.9c.5-.8 1.4-1.9 3.4-1.9 2.5 0 4.3 1.6 4.3 5.1V21z"
  }
] as const;

type WidgetPos = { x: number; y: number };

function clampPos(x: number, y: number, width: number, height: number): WidgetPos {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY)
  };
}

function defaultMobilePos(width: number, height: number): WidgetPos {
  const margin = 12;
  return clampPos(
    window.innerWidth - width - margin,
    window.innerHeight * 0.38 - height / 2,
    width,
    height
  );
}

function SubscribeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setEmail("");
      setError(null);
      setDone(false);
      setLoading(false);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = email.trim().toLowerCase();
    if (!value) {
      setError("Please enter your email.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: value, source: "floating-subscribe" })
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Could not subscribe right now.");
      }
      setDone(true);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const whatsappHref = whatsAppSiteUrl(
    "Hi Sarveda — I'd like to join the community for workshops, new instruments and sound healing updates."
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-brand-night/50 backdrop-blur-[3px]"
        aria-label="Close subscribe dialog"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[26rem] overflow-hidden rounded-[1.5rem] bg-white shadow-[0_24px_60px_rgba(16,32,26,0.3)]">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-md"
          style={{ backgroundColor: HOME_GREEN }}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="px-6 pb-7 pt-6 text-center sm:px-8">
          <div className="relative mx-auto aspect-square w-full max-w-[14rem] overflow-hidden rounded-xl bg-brand-cream">
            <Image
              src="/images/home/newsletter-lifestyle.jpg"
              alt="Sarveda singing bowl and mindful living essentials"
              fill
              sizes="224px"
              className="object-cover"
            />
          </div>

          <h2
            id={titleId}
            className="mt-5 font-serif text-[1.65rem] font-semibold tracking-tight text-brand-ink sm:text-[1.85rem]"
          >
            Join the Sarveda Circle
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[#5c564c]">
            Get tips and live updates on sound healing, yoga and conscious living — plus curated
            instrument picks, exclusive offers, early access to workshops, and community notes by
            email or WhatsApp.
          </p>

          {done ? (
            <p className="mt-5 rounded-xl bg-[#e8f6f1] px-4 py-3 text-sm font-medium text-[#166D46]">
              You&apos;re in. Watch your inbox for thoughtful updates from Sarveda.
            </p>
          ) : (
            <form className="mt-5" onSubmit={(e) => void onSubmit(e)} noValidate>
              <label htmlFor="float-subscribe-email" className="sr-only">
                Email address
              </label>
              <div className="relative">
                <input
                  id="float-subscribe-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="Enter your email"
                  className="min-h-[48px] w-full rounded-xl border-0 bg-[#f3f1ec] py-3 pl-4 pr-14 text-sm text-brand-ink outline-none ring-1 ring-transparent placeholder:text-[#9a9184] focus:ring-[#166D46]/35 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white transition hover:brightness-95 disabled:opacity-60"
                  style={{ backgroundColor: HOME_GREEN }}
                  aria-label="Subscribe with email"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
              {error ? (
                <p className="mt-2 text-left text-sm text-brand-terra" role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          )}

          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-95"
            style={{ backgroundColor: HOME_GREEN }}
          >
            Join on WhatsApp
            <span aria-hidden>→</span>
          </a>

          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-[#9a9184]">
            Follow Us on Social Media
          </p>
          <div className="mt-3 flex items-center justify-center gap-4">
            {SOCIAL.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="text-brand-ink/80 transition hover:text-[#166D46]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <path d={s.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function WidgetCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute -left-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-white text-brand-ink shadow-sm transition hover:bg-brand-cream"
      aria-label="Hide social widget"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

export function FloatingSocialSubscribe() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pos, setPos] = useState<WidgetPos | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    setHidden(sessionStorage.getItem(STORAGE_HIDDEN) === "1");

    const saved = sessionStorage.getItem(STORAGE_POS);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as WidgetPos;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setPos(parsed);
        }
      } catch {
        /* ignore invalid saved position */
      }
    }

    const mq = window.matchMedia("(max-width: 767px)");
    const syncMobile = () => setIsMobile(mq.matches);
    syncMobile();
    mq.addEventListener("change", syncMobile);
    return () => mq.removeEventListener("change", syncMobile);
  }, []);

  useEffect(() => {
    if (!isMobile || pos || !widgetRef.current) return;
    const rect = widgetRef.current.getBoundingClientRect();
    setPos(defaultMobilePos(rect.width, rect.height));
  }, [isMobile, pos]);

  const persistPos = useCallback((next: WidgetPos) => {
    setPos(next);
    sessionStorage.setItem(STORAGE_POS, JSON.stringify(next));
  }, []);

  const dismissWidget = useCallback(() => {
    setHidden(true);
    sessionStorage.setItem(STORAGE_HIDDEN, "1");
  }, []);

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isMobile || !widgetRef.current || !pos) return;
      e.preventDefault();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [isMobile, pos]
  );

  const onDragHandlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !widgetRef.current) return;
      const rect = widgetRef.current.getBoundingClientRect();
      const next = clampPos(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY),
        rect.width,
        rect.height
      );
      persistPos(next);
    },
    [persistPos]
  );

  const onDragHandlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  if (!mounted || hidden) return null;

  const widgetBody = (
    <>
      <WidgetCloseButton onClick={dismissWidget} />
      {isMobile ? (
        <div
          className="flex w-full cursor-grab items-center justify-center border-b border-black/8 bg-[#f3f1ec]/80 py-1.5 active:cursor-grabbing"
          aria-label="Drag to reposition"
          onPointerDown={onDragHandlePointerDown}
          onPointerMove={onDragHandlePointerMove}
          onPointerUp={onDragHandlePointerUp}
          onPointerCancel={onDragHandlePointerUp}
        >
          <span className="h-1 w-8 rounded-full bg-black/20" aria-hidden />
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-3.5 px-3 py-5 sm:gap-4 sm:px-3.5 sm:py-6">
        {SOCIAL.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            className="text-brand-ink transition hover:text-[#166D46]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-[22px] sm:w-[22px]" fill="currentColor" aria-hidden>
              <path d={s.path} />
            </svg>
          </a>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center border-t border-black/8 bg-[#f3f1ec] px-2.5 py-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-ink transition hover:bg-[#ebe7df] sm:px-3 sm:py-7 sm:text-xs"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="inline-block rotate-180 [writing-mode:vertical-rl]">Subscribe</span>
      </button>
    </>
  );

  return (
    <>
      {isMobile ? (
        <div
          ref={widgetRef}
          className="pointer-events-auto fixed z-[55] touch-none md:hidden"
          style={
            pos
              ? { left: pos.x, top: pos.y }
              : { right: 12, top: "38%", transform: "translateY(-50%)" }
          }
          aria-label="Social links and subscribe"
        >
          <div className="relative flex flex-col items-center overflow-hidden rounded-full border border-black/10 bg-white/95 shadow-[0_10px_32px_rgba(16,32,26,0.18)] backdrop-blur-sm">
            {widgetBody}
          </div>
        </div>
      ) : (
        <div
          className="pointer-events-none fixed right-3 top-1/2 z-[55] hidden -translate-y-1/2 sm:right-4 md:block lg:right-5"
          aria-label="Social links and subscribe"
        >
          <div className="pointer-events-auto relative flex flex-col items-center overflow-hidden rounded-full border border-black/10 bg-white/95 shadow-[0_10px_32px_rgba(16,32,26,0.18)] backdrop-blur-sm">
            {widgetBody}
          </div>
        </div>
      )}

      <SubscribeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
