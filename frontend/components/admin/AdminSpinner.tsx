"use client";

type AdminSpinnerProps = {
  size?: number;
  className?: string;
  label?: string;
};

/** Calm in-flight indicator — admin only. */
export function AdminSpinner({ size = 16, className = "", label = "Loading" }: AdminSpinnerProps) {
  return (
    <span
      className={`admin-spinner inline-block rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label={label}
    />
  );
}
