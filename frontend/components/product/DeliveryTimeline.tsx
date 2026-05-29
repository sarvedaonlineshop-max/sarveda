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

export function DeliveryTimeline({
  preparationDays = "5 - 10 Days",
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
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l1.732 6.9m0 0l1.155 4.62A1.125 1.125 0 008.663 16.5h9.674m-9.674 0a1.125 1.125 0 00-1.087 1.417l.384 1.532M8.663 16.5h9.674m0 0l1.155 4.62a1.125 1.125 0 01-1.087 1.417H8.663" />
        </svg>
      )
    },
    {
      label: "Preparation Time",
      detail: preparationDays,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      label: "Standard Shipping",
      detail: shippingDays,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9H5.25" />
        </svg>
      )
    },
    {
      label: "Estimated Delivery",
      detail: `${formatDay(deliveryStart)} - ${formatDay(deliveryEnd)}`,
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      )
    }
  ];

  return (
    <div className="rounded-lg border border-[rgba(196,176,232,0.25)] bg-brand-bg/80 px-3 py-4 sm:px-4">
      <div className="relative overflow-x-auto pb-1">
        <div className="relative flex min-w-[720px] items-start justify-between gap-2 sm:min-w-0 sm:gap-0">
          <span
            className="absolute left-12 right-12 top-5 h-px bg-brand-violet/20 sm:left-16 sm:right-16"
            aria-hidden
          />
          {steps.map((step) => (
            <div key={step.label} className="relative z-10 w-40 text-center sm:w-36">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-violet/10 text-brand-violet">
                {step.icon}
              </div>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-brand-mid sm:text-xs">
                {step.label}
              </p>
              <p className="mt-0.5 text-xs font-medium text-brand-ink">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
