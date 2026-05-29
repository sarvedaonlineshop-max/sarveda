"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { resolveMediaUrl } from "@/lib/media-cdn";

type Props = {
  audioUrl: string;
  title: string;
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

  if (variant === "storefront") {
    return (
      <div className="rounded-xl border border-brand-sage-light bg-brand-sage-light p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-violet">Audio Sample</p>
        <p className="mt-1 text-sm font-medium text-brand-ink">{title}</p>
        <audio ref={audioRef} preload="metadata" src={src} className="mt-3 w-full rounded-md bg-white" controls>
          <track kind="captions" />
        </audio>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[rgba(196,176,232,0.25)] bg-brand-violet-light p-5 shadow-inner">
      <audio ref={audioRef} preload="metadata" className="hidden">
        <source src={src} />
      </audio>
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-violet">Listen</p>
      <p className="mt-1 font-serif text-lg text-brand-ink">{title}</p>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          className="flex h-12 min-w-[48px] shrink-0 items-center justify-center rounded-full bg-brand-violet-deep text-brand-gold shadow-md transition-colors hover:bg-brand-violet-mid hover:text-white"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="min-w-0 flex-1 text-xs tabular-nums text-brand-muted">
          {fmt(current)} / {fmt(duration)}
        </div>
      </div>
    </div>
  );
}
