"use client";

const DEFAULT_THRESHOLD_PAISE = 99900;

function freeShippingThresholdPaise(): number {
  const raw = process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_PAISE;
  if (!raw?.trim()) return DEFAULT_THRESHOLD_PAISE;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_THRESHOLD_PAISE;
}

export function FreeShippingBar({
  subtotalInPaise,
  currency = "INR"
}: {
  subtotalInPaise: number;
  currency?: string;
}) {
  if (currency !== "INR") return null;

  const threshold = freeShippingThresholdPaise();
  const remaining = Math.max(0, threshold - subtotalInPaise);
  const percent = Math.min(100, (subtotalInPaise / threshold) * 100);
  const qualified = subtotalInPaise >= threshold;

  return (
    <div style={{ padding: "10px 0" }}>
      <div
        style={{
          height: "4px",
          borderRadius: "999px",
          background: "var(--brand-cream-dark)",
          overflow: "hidden",
          marginBottom: "6px"
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            borderRadius: "999px",
            background: qualified ? "var(--brand-sage)" : "var(--brand-gold)",
            transition: "width 0.4s ease"
          }}
        />
      </div>
      <p
        style={{
          fontSize: "12px",
          color: qualified ? "var(--brand-sage)" : "var(--brand-muted)",
          textAlign: "center"
        }}
      >
        {qualified ? (
          <span>
            You qualify for <strong>free shipping!</strong>
          </span>
        ) : (
          <span>
            Add{" "}
            <strong>₹{Math.ceil(remaining / 100).toLocaleString("en-IN")}</strong> more for free shipping
          </span>
        )}
      </p>
    </div>
  );
}
