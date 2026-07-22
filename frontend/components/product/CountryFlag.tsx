"use client";

import { countryDisplayName, countryFlagEmoji, countryFlagImageUrl } from "@/lib/country-flag";

type Props = {
  code: string | null | undefined;
  className?: string;
  /** Show country name next to the flag (default true). */
  showName?: boolean;
};

/** Flag image from flagcdn.com with emoji fallback (Windows/Linux often lack emoji flags). */
export function CountryFlag({ code, className, showName = true }: Props) {
  const upper = code?.trim().toUpperCase() ?? "";
  if (upper.length !== 2) return null;

  const name = countryDisplayName(upper) ?? upper;
  const img = countryFlagImageUrl(upper);
  const emoji = countryFlagEmoji(upper);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        color: "var(--brand-muted)"
      }}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img}
          alt=""
          width={20}
          height={15}
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{
            display: "inline-block",
            borderRadius: "2px",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.08)"
          }}
        />
      ) : emoji ? (
        <span aria-hidden style={{ fontSize: "14px", lineHeight: 1 }}>
          {emoji}
        </span>
      ) : null}
      {showName ? <span>{name}</span> : null}
    </span>
  );
}
