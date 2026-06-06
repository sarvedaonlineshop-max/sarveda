export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

/** Back-calculate GST from GST-inclusive price (minor units). */
export function extractGst(
  inclusivePriceInPaise: number,
  gstRatePercent: number
): { baseInPaise: number; gstInPaise: number } {
  if (gstRatePercent <= 0) {
    return {
      baseInPaise: inclusivePriceInPaise,
      gstInPaise: 0
    };
  }
  const rate = gstRatePercent / 100;
  const baseInPaise = Math.round(inclusivePriceInPaise / (1 + rate));
  const gstInPaise = inclusivePriceInPaise - baseInPaise;
  return { baseInPaise, gstInPaise };
}

export const DEFAULT_DISPLAY_GST_RATE = 18;
