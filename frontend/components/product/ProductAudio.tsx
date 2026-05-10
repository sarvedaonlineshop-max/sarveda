"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  audioUrl: string;
  title: string;
};

export function ProductAudio({ audioUrl, title }: Props) {
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
  }, [audioUrl, syncProgress]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play();
    }
  };

  const seek = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    el.currentTime = (x / rect.width) * duration;
    syncProgress();
  };

  const fmt = (sec: number) => {
    if (!Number.isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const current = progress * duration;

  return (
    <div className="rounded-2xl border border-stone-100 bg-amber-50 p-5 shadow-inner">
      <audio ref={audioRef} preload="metadata" className="hidden">
        <source src={audioUrl} />
      </audio>
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">Listen</p>
      <p className="mt-1 font-serif text-lg text-stone-900">{title}</p>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          className="flex h-12 min-w-[48px] shrink-0 items-center justify-center rounded-full bg-stone-900 text-amber-400 shadow-md transition-colors hover:bg-amber-700 hover:text-white"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
            </svg>
          ) : (
            <svg className="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={seek}
            className="relative h-3 w-full cursor-pointer rounded-full bg-stone-200 text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-amber-700"
            aria-label="Seek audio"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-700 via-amber-600 to-amber-500"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
            {/* waveform illusion */}
            <span className="pointer-events-none absolute inset-0 flex items-center justify-around px-1 opacity-40">
              {Array.from({ length: 24 }).map((_, i) => (
                <span
                  key={i}
                  className="w-0.5 rounded-full bg-stone-600"
                  style={{ height: `${30 + (i % 5) * 12}%` }}
                />
              ))}
            </span>
          </button>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-stone-500">
            <span>{fmt(current)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
