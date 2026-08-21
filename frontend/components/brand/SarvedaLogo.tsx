import Image from "next/image";
import Link from "next/link";

const LOGO_LIGHT = "/images/brand/sarveda-logo.png";
const LOGO_DARK = "/images/brand/sarveda-logo-on-dark.png";

/** Combined mark + wordmark asset aspect (gap between icon and wordmark). */
const LOGO_W = 880;
const LOGO_H = 296;

type SarvedaLogoProps = {
  href?: string;
  className?: string;
  /** Logo height in px (desktop baseline; mobile scales via CSS when responsive). */
  iconHeight?: number;
  showWordmark?: boolean;
  /** Scale logo down on small screens so the header stays usable. */
  responsive?: boolean;
  /**
   * `onDark` — cream wordmark for forest footer / dark surfaces.
   * Default keeps the forest-green wordmark for light headers.
   */
  tone?: "onLight" | "onDark";
  /** @deprecated Tagline removed from header; kept for call-site compat. */
  showTagline?: boolean;
  wordmarkClassName?: string;
  taglineClassName?: string;
};

export function SarvedaLogo({
  href = "/",
  className = "",
  iconHeight = 64,
  showWordmark = true,
  responsive = false,
  tone = "onLight"
}: SarvedaLogoProps) {
  const src = tone === "onDark" ? LOGO_DARK : LOGO_LIGHT;
  // iconHeight historically sized the spiral only; combined logo is wider — use ~0.72 of that height.
  const height = Math.max(36, Math.round(iconHeight * (showWordmark ? 0.72 : 0.9)));
  const width = Math.round(height * (LOGO_W / LOGO_H));

  const content = (
    <div className={`flex items-center overflow-visible ${className}`}>
      <Image
        src={src}
        alt={showWordmark ? "Sarveda" : ""}
        width={width}
        height={height}
        className={
          responsive
            ? "h-[40px] w-auto shrink-0 object-contain object-left sm:h-[48px] md:h-[56px]"
            : "w-auto shrink-0 object-contain object-left"
        }
        style={responsive ? { width: "auto" } : { height, width: "auto" }}
        priority
        aria-hidden={!showWordmark}
      />
    </div>
  );

  if (!href) return content;

  return (
    <Link href={href} className="group shrink-0" aria-label="Sarveda home">
      {content}
    </Link>
  );
}

/** Large watermark for hero / auth backgrounds — uses the spiral mark portion via full logo. */
export function SarvedaLogoWatermark({
  className = "opacity-[0.08]",
  height = 280,
  tone = "onLight"
}: {
  className?: string;
  height?: number;
  tone?: "onLight" | "onDark";
}) {
  const width = Math.round(height * (LOGO_W / LOGO_H));
  return (
    <Image
      src={tone === "onDark" ? LOGO_DARK : LOGO_LIGHT}
      alt=""
      width={width}
      height={height}
      className={`pointer-events-none select-none object-contain ${className}`}
      aria-hidden
    />
  );
}
