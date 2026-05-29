export function CheckoutProgress() {
  const steps = [
    { label: "Cart", state: "done" as const },
    { label: "Details", state: "active" as const },
    { label: "Payment", state: "todo" as const }
  ];

  return (
    <ol className="mb-8 flex items-center justify-center gap-2 sm:gap-4" aria-label="Checkout progress">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2 sm:gap-4">
          <div className="flex flex-col items-center gap-1.5">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                step.state === "done"
                  ? "bg-brand-green text-white"
                  : step.state === "active"
                    ? "bg-brand-violet text-white"
                    : "bg-brand-violet-light text-brand-mid"
              }`}
            >
              {step.state === "done" ? "✓" : index + 1}
            </span>
            <span
              className={`text-[10px] uppercase tracking-[0.08em] ${
                step.state === "active"
                  ? "text-brand-violet"
                  : step.state === "done"
                    ? "text-brand-green"
                    : "text-brand-muted"
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 ? (
            <span
              className="mb-5 hidden h-0.5 w-8 sm:block md:w-12"
              style={{
                background:
                  step.state === "done" ? "#2E7D52" : "rgba(196,176,232,0.35)"
              }}
              aria-hidden
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
