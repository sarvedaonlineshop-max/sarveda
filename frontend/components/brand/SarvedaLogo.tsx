import Image from "next/image";
import Link from "next/link";

const MARK_SRC = "/brand/sarveda-logo.png";
const WORDMARK_SRC = "/brand/sarveda-wordmark.png";

const WORDMARK_W = 200;
const WORDMARK_H = 40;

type SarvedaLogoProps = {
  href?: string;
  className?: string;
  /** Spiral mark height in px */
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
  iconHeight = 44,
  showWordmark = true
}: SarvedaLogoProps) {
  // Wider mark: stretch aspect slightly for more presence in the nav.
  const iconWidth = Math.round(iconHeight * (620 / 1024));
  const wordmarkHeight = Math.max(20, Math.round(iconHeight * 0.78));
  const wordmarkWidth = Math.round(wordmarkHeight * (WORDMARK_W / WORDMARK_H) * 1.15);

  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src={MARK_SRC}
        alt=""
        width={iconWidth}
        height={iconHeight}
        className="shrink-0 object-contain"
        priority
        aria-hidden
      />
      {showWordmark ? (
        <Image
          src={WORDMARK_SRC}
          alt="Sarveda"
          width={wordmarkWidth}
          height={wordmarkHeight}
          className="object-contain object-left"
          style={{ height: wordmarkHeight, width: wordmarkWidth }}
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
