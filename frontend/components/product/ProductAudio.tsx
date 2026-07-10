"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { resolveMediaUrl } from "@/lib/media-cdn";

type Props = {
  audioUrl: string;
  /** Shown only on non-storefront variant (legacy layout). */
  title?: string;
  variant?: "default" | "storefront";
};

export function ProductAudio({ audioUrl, title, variant = "default" }: Props) {
  const src = resolveMediaUrl(audioUrl) ?? audioUrl;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const syncProgress = useCallback(() => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    setProgress(el.currentTime / el.duration);
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onMeta = () => setDuration(el.duration || 0);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", syncProgress);
    el.addEventListener("ended", () => {
      setPlaying(false);
      setProgress(0);
    });
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", syncProgress);
    };
  }, [src, syncProgress]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else void el.play();
  };

  const fmt = (sec: number) => {
    if (!Number.isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const current = progress * duration;

  const seek = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * el.duration;
    syncProgress();
  };

  if (variant === "storefront") {
    return (
      <div className="rounded-2xl bg-brand-forest p-5 shadow-card">
        <audio ref={audioRef} preload="metadata" src={src} className="hidden">
          <track kind="captions" />
        </audio>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
          Hear this bowl
        </p>
        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={toggle}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-gold text-brand-night transition-colors hover:bg-[#a37934]"
            aria-label={playing ? "Pause audio sample" : "Play audio sample"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M7.5 5.1a1 1 0 0 1 1.52-.85l11 6.9a1 1 0 0 1 0 1.7l-11 6.9a1 1 0 0 1-1.52-.85V5.1z" />
              </svg>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={seek}
              className="block h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-brand-cream/20"
              aria-label="Seek audio"
            >
              <span
                className="block h-full rounded-full bg-brand-gold transition-[width] duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </button>
            <p className="mt-2 text-xs tabular-nums text-brand-cream/60">
              {fmt(current)} / {fmt(duration)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-100 bg-amber-50 p-5 shadow-inner">
      <audio ref={audioRef} preload="metadata" className="hidden">
        <source src={src} />
      </audio>
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">Listen</p>
      {title ? <p className="mt-1 font-serif text-lg text-stone-900">{title}</p> : null}

      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          className="flex h-12 min-w-[48px] shrink-0 items-center justify-center rounded-full bg-stone-900 text-amber-400 shadow-md transition-colors hover:bg-amber-700 hover:text-white"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="min-w-0 flex-1 text-xs tabular-nums text-stone-500">
          {fmt(current)} / {fmt(duration)}
        </div>
      </div>
    </div>
  );
}
