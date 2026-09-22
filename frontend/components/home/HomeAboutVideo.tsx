"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";

export const HOME_ABOUT_VIDEO_SRC = "/images/home/homepage-about.mp4";
export const HOME_ABOUT_POSTER_SRC = "/images/home/homepage-about-poster.jpg";

/**
 * 16:9 brand video under the Thoughtfully Curated copy.
 * Shows a still thumbnail until the shopper taps play.
 */
export function HomeAboutVideo({ className = "" }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const startPlayback = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    setPlaying(true);
    void el.play().catch(() => {
      setPlaying(false);
    });
  }, []);

  return (
    <div className={`w-full py-6 sm:py-8 md:py-10 ${className}`.trim()}>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#1a2e26] shadow-[0_12px_40px_rgba(26,46,38,0.12)]">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          poster={HOME_ABOUT_POSTER_SRC}
          controls={playing}
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
        >
          <source src={HOME_ABOUT_VIDEO_SRC} type="video/mp4" />
        </video>

        {!playing ? (
          <button
            type="button"
            onClick={startPlayback}
            className="absolute inset-0 z-[1] flex items-center justify-center"
            aria-label="Play Sarveda film"
          >
            <Image
              src={HOME_ABOUT_POSTER_SRC}
              alt="Sarveda artisans and sound healing practice"
              fill
              sizes="(max-width: 768px) 92vw, 1100px"
              className="object-cover"
              priority={false}
            />
            <span className="relative z-[2] flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-[#1a2e26] text-white shadow-[0_8px_24px_rgba(26,46,38,0.35)] ring-4 ring-white/80 transition hover:scale-105 sm:h-[4.75rem] sm:w-[4.75rem]">
              <svg className="ml-1 h-7 w-7" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M6.3 4.2a1 1 0 011.05.1l7.2 4.8a1 1 0 010 1.66l-7.2 4.8A1 1 0 016 14.8V5.2a1 1 0 01.3-.8z" />
              </svg>
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
