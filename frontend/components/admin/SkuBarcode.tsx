"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Props = {
  value: string;
  className?: string;
  /** Bar height in px for on-screen preview */
  height?: number;
  displayValue?: boolean;
};

/** Renders a Code128 barcode from a unique SKU (or any string). */
export function SkuBarcode({
  value,
  className,
  height = 40,
  displayValue = false
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    const code = value.trim();
    if (!el || !code) return;
    try {
      JsBarcode(el, code, {
        format: "CODE128",
        height,
        width: 1.4,
        margin: 0,
        displayValue,
        fontSize: 10,
        textMargin: 2
      });
    } catch {
      el.replaceChildren();
    }
  }, [value, height, displayValue]);

  if (!value.trim()) {
    return (
      <span className="text-xs text-stone-400">Enter SKU to generate barcode</span>
    );
  }

  return <svg ref={svgRef} className={className} role="img" aria-label={`Barcode ${value}`} />;
}
