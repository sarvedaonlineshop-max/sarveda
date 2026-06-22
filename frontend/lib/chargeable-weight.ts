import type { DelhiveryShipBox } from "@/lib/admin-api";

export type ChargeableWeightBreakdown = {
  deadGrams: number;
  volumetricGrams: number;
  chargeableGrams: number;
  usesVolumetric: boolean;
};

/** Delhivery chargeable weight (matches backend delhivery.ts). */
export function chargeableWeightGrams(box: DelhiveryShipBox): number {
  return breakdownChargeableWeight(box).chargeableGrams;
}

export function breakdownChargeableWeight(box: DelhiveryShipBox): ChargeableWeightBreakdown {
  const deadGrams = Math.max(50, Math.round(box.weightGrams));
  if (box.packageType === "PLASTIC_COVER" && deadGrams <= 1000) {
    return { deadGrams, volumetricGrams: 0, chargeableGrams: deadGrams, usesVolumetric: false };
  }
  const volKg =
    (Math.max(1, box.lengthCm) * Math.max(1, box.breadthCm) * Math.max(1, box.heightCm)) / 5000;
  const volumetricGrams = Math.round(volKg * 1000);
  const chargeableGrams = Math.max(deadGrams, volumetricGrams, 50);
  return {
    deadGrams,
    volumetricGrams,
    chargeableGrams,
    usesVolumetric: volumetricGrams > deadGrams
  };
}

export function totalChargeableWeightGrams(boxes: DelhiveryShipBox[]): number {
  return boxes.reduce((sum, b) => sum + chargeableWeightGrams(b), 0);
}

/** Keep only digits; empty string allowed while typing. */
export function digitsOnly(raw: string, maxLen = 3): string {
  return raw.replace(/\D/g, "").slice(0, maxLen);
}

/** Parse dimension input to positive integer in [min, max]. */
export function parsePositiveInt(raw: string, min: number, max: number): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function validateBoxDimensions(lengthCm: number, breadthCm: number, heightCm: number): string | null {
  if (lengthCm < 5 || breadthCm < 5 || heightCm < 5) {
    return "Each side must be at least 5 cm.";
  }
  if (lengthCm + breadthCm + heightCm < 15) {
    return "Length + breadth + height must be at least 15 cm.";
  }
  return null;
}
