import Image from "next/image";
import Link from "next/link";

const MARK_SRC = "/brand/sarveda-logo.png";
const WORDMARK_SRC = "/brand/sarveda-wordmark.png";

/** Intrinsic size of `sarveda-wordmark.png` after trim. */
const WORDMARK_W = 200;
const WORDMARK_H = 40;

type SarvedaLogoProps = {
  /** Wrap in home link */
  href?: string;
  className?: string;
  /** Icon height in px */
  iconHeight?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  /** Kept for call-site compatibility; wordmark is now the brand PNG. */
  wordmarkClassName?: string;
  taglineClassName?: string;
};

export function SarvedaLogo({
  href = "/",
  className = "",
  iconHeight = 36,
  showWordmark = true,
  showTagline = false,
  taglineClassName = "hidden text-[9px] font-normal tracking-[0.2em] text-brand-sage md:block"
}: SarvedaLogoProps) {
  const iconWidth = Math.round(iconHeight * (520 / 1024));
  const wordmarkHeight = Math.max(16, Math.round(iconHeight * 0.72));
  const wordmarkWidth = Math.round(wordmarkHeight * (WORDMARK_W / WORDMARK_H));

  const content = (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src={MARK_SRC}
        alt=""
        width={iconWidth}
        height={iconHeight}
        className="shrink-0 object-contain"
        priority
        aria-hidden
      />
      {(showWordmark || showTagline) && (
        <div className="flex min-w-0 flex-col justify-center gap-0.5">
          {showWordmark ? (
            <Image
              src={WORDMARK_SRC}
              alt="Sarveda"
              width={wordmarkWidth}
              height={wordmarkHeight}
              className="h-auto w-auto object-contain object-left"
              style={{ height: wordmarkHeight, width: "auto" }}
              priority
            />
          ) : null}
          {showTagline ? (
            <span className={showWordmark ? taglineClassName : taglineClassName.replace("hidden ", "")}>
              YOGA · MEDITATION · SOUND
            </span>
          ) : null}
        </div>
      )}
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
