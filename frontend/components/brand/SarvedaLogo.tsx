import Image from "next/image";
import Link from "next/link";

const MARK_SRC = "/brand/sarveda-mark.png";
const WORDMARK_SRC = "/brand/sarveda-wordmark.png";

/** Native mark is tall (spiral + tails). Wordmark is wide and short. */
const MARK_W = 40;
const MARK_H = 68;
const WORDMARK_W = 200;
const WORDMARK_H = 40;

type SarvedaLogoProps = {
  href?: string;
  className?: string;
  /** Spiral mark height in px (desktop baseline; mobile scales via CSS) */
  iconHeight?: number;
  showWordmark?: boolean;
  /** @deprecated Tagline removed from header; kept for call-site compat. */
  showTagline?: boolean;
  wordmarkClassName?: string;
  taglineClassName?: string;
};

export function SarvedaLogo({
  href = "/",
  className = "",
  iconHeight = 64,
  showWordmark = true
}: SarvedaLogoProps) {
  const iconWidth = Math.round(iconHeight * (MARK_W / MARK_H));
  // Wordmark sits beside the spiral body, not as tall as the tails (SS2 ratio).
  const wordmarkHeight = Math.max(22, Math.round(iconHeight * 0.55));
  const wordmarkWidth = Math.round(wordmarkHeight * (WORDMARK_W / WORDMARK_H));

  const content = (
    <div className={`flex items-center gap-2 sm:gap-2.5 md:gap-3 ${className}`}>
      <Image
        src={MARK_SRC}
        alt=""
        width={iconWidth}
        height={iconHeight}
        className="w-auto shrink-0 object-contain object-center"
        style={{ height: iconHeight, width: "auto" }}
        priority
        aria-hidden
      />
      {showWordmark ? (
        <Image
          src={WORDMARK_SRC}
          alt="Sarveda"
          width={wordmarkWidth}
          height={wordmarkHeight}
          className="w-auto object-contain object-left"
          style={{ height: wordmarkHeight, width: "auto" }}
          priority
        />
      ) : null}
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="group shrink-0" aria-label="Sarveda home">
      {content}
    </Link>
  );
}

/** Large watermark for hero / auth backgrounds */
export function SarvedaLogoWatermark({
  className = "opacity-[0.08]",
  height = 280
}: {
  className?: string;
  height?: number;
}) {
  const width = Math.round(height * (520 / 1024));
  return (
    <Image
      src={MARK_SRC}
      alt=""
      width={width}
      height={height}
      className={`pointer-events-none select-none object-contain ${className}`}
      aria-hidden
    />
  );
}
