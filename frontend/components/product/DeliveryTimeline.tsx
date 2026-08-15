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
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function parseRange(text: string): { min: number; max: number } {
  const nums = text.match(/\d+/g)?.map((n) => parseInt(n, 10)).filter(Number.isFinite) ?? [];
  if (!nums.length) return { min: 0, max: 0 };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
}

function formatDeliveryRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) return `${formatDay(start)} - ${end.getDate()}`;
  return `${formatDay(start)} - ${formatDay(end)}`;
}

/**
 * Live Woo logic: Order placed = today.
 * Estimated delivery = today + (prep min + ship min) … today + (prep max + ship max).
 * Example: 15 Aug + (5+4)…(6+7) → 24–28 Aug.
 */
export function DeliveryTimeline({
  preparationDays = "5 - 6 Days",
  shippingDays = "4 - 7 Days"
}: Props) {
  const today = new Date();
  const prep = parseRange(preparationDays);
  const ship = parseRange(shippingDays);
  const deliveryStart = addDays(today, prep.min + ship.min);
  const deliveryEnd = addDays(today, prep.max + ship.max);

  const steps = [
    {
      label: "Order Placed",
      detail: formatDay(today),
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25h9.75m-9.75 0A2.25 2.25 0 015.25 12V6.75h12.53l1.5 5.25H18A2.25 2.25 0 0120.25 14.25m-12.75 0v2.25a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25V14.25" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.75l1.5 1.5 3-3" />
        </svg>
      )
    },
    {
      label: "Preparation Time",
      detail: preparationDays,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      label: "Standard Shipping",
      detail: shippingDays,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9H5.25" />
        </svg>
      )
    },
    {
      label: "Estimated Delivery",
      detail: formatDeliveryRange(deliveryStart, deliveryEnd),
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      )
    }
  ];

  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative flex min-w-[640px] items-start justify-between sm:min-w-0">
        <span
          className="absolute left-[12%] right-[12%] top-5 h-px bg-[#7eb8a8]/70"
          aria-hidden
        />
        {steps.map((step) => (
          <div key={step.label} className="relative z-10 w-[23%] min-w-[8.5rem] text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-[#dceee8] text-[#1a8a72]">
              {step.icon}
            </div>
            <p className="mt-2 text-[11px] leading-tight text-stone-500 sm:text-xs">{step.label}</p>
            <p className="mt-0.5 text-xs font-bold text-[#108967] sm:text-sm">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
