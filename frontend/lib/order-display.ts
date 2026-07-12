export type CancellationInfo = {
  title: string;
  description: string;
  category: string;
  occurredAt: string;
  rawReason: string | null;
};

export function paymentProviderLabel(provider?: string | null): string {
  switch (provider) {
    case "RAZORPAY":
      return "Razorpay";
    case "STRIPE":
      return "Stripe";
    case "PAYPAL":
      return "PayPal";
    case "COD":
      return "Cash on delivery";
    default:
      return "Paid online";
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
