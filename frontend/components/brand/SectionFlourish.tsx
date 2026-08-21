import Image from "next/image";

const FLOURISH_SRC = "/images/brand/section-flourish.png";
const FLOURISH_W = 982;
const FLOURISH_H = 143;

type Props = {
  className?: string;
  /** Max display width in px (height scales). Default ~112. */
  width?: number;
};

/** Gold calligraphic divider used under homepage section titles. */
export function SectionFlourish({ className = "", width = 112 }: Props) {
  const height = Math.round(width * (FLOURISH_H / FLOURISH_W));
  return (
    <Image
      src={FLOURISH_SRC}
      alt=""
      width={FLOURISH_W}
      height={FLOURISH_H}
      className={`mx-auto mt-3 object-contain ${className}`}
      style={{ width, height, maxWidth: "100%" }}
      aria-hidden
    />
  );
}
