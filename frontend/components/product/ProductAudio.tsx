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

  if (variant === "storefront") {
    return (
      <div className="rounded-xl border border-[#d8e7df] bg-[#f4f8f2] p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1e3a2f]">Audio sample</p>
        <audio ref={audioRef} preload="metadata" src={src} className="mt-3 w-full rounded-md bg-white" controls>
          <track kind="captions" />
        </audio>
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
