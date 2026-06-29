import Image from "next/image";
import Link from "next/link";

const LOGO_SRC = "/brand/sarveda-logo.png";

type SarvedaLogoProps = {
  /** Wrap in home link */
  href?: string;
  className?: string;
  /** Icon height in px */
  iconHeight?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  wordmarkClassName?: string;
  taglineClassName?: string;
};

export function SarvedaLogo({
  href = "/",
  className = "",
  iconHeight = 36,
  showWordmark = true,
  showTagline = false,
  wordmarkClassName = "font-serif text-xl italic leading-tight text-brand-gold md:text-2xl",
  taglineClassName = "hidden text-[10px] font-normal tracking-[0.22em] text-brand-sage md:block"
}: SarvedaLogoProps) {
  const iconWidth = Math.round(iconHeight * (520 / 1024));

  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src={LOGO_SRC}
        alt=""
        width={iconWidth}
        height={iconHeight}
        className="shrink-0 object-contain"
        priority
        aria-hidden
      />
      {(showWordmark || showTagline) && (
        <div className="flex min-w-0 flex-col">
          {showWordmark ? (
            <span className={wordmarkClassName}>Sarveda</span>
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
    <Link href={href} className="group shrink-0">
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
      src={LOGO_SRC}
      alt=""
      width={width}
      height={height}
      className={`pointer-events-none select-none object-contain ${className}`}
      aria-hidden
    />
  );
}
