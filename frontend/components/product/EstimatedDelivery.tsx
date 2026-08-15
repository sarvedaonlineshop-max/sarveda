"use client";

type Props = {
  preparationDays?: string;
  shippingDays?: string;
};

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function parseRange(text: string): { min: number; max: number } {
  const nums = text.match(/\d+/g)?.map((n) => parseInt(n, 10)).filter(Number.isFinite) ?? [];
  if (!nums.length) return { min: 5, max: 10 };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
}

/** Compact delivery estimate for narrow buy box (no overlapping timeline). */
export function EstimatedDelivery({
  preparationDays = "5 - 6 Days",
  shippingDays = "4 - 7 Days"
}: Props) {
  const today = new Date();
  const prep = parseRange(preparationDays);
  const ship = parseRange(shippingDays);
  const deliveryStart = addDays(today, prep.min + ship.min);
  const deliveryEnd = addDays(today, prep.max + ship.max);

  const range =
    deliveryStart.getTime() === deliveryEnd.getTime()
      ? formatDay(deliveryStart)
      : `${formatDay(deliveryStart)} – ${formatDay(deliveryEnd)}`;

  return (
    <p className="text-sm text-stone-700">
      <span className="font-medium text-stone-900">Estimated delivery:</span>{" "}
      <span className="text-[#108967] font-semibold">{range}</span>
    </p>
  );
}
