export type PaymentOutcome = "dismiss" | "failed" | "pending";

export function parsePaymentOutcome(raw: string | null): PaymentOutcome {
  if (raw === "failed" || raw === "pending" || raw === "dismiss") return raw;
  return "dismiss";
}

export function paymentComplaintHref(input: {
  orderNumber?: string;
  email?: string;
  outcome: PaymentOutcome;
}): string {
  const q = new URLSearchParams();
  q.set("subject", "PAYMENT");
  q.set("complaint", input.outcome === "pending" ? "debited" : input.outcome === "failed" ? "failed" : "exit");
  if (input.orderNumber) q.set("orderNumber", input.orderNumber);
  if (input.email) q.set("email", input.email);
  return `/contact?${q.toString()}`;
}

export function paymentOutcomeCopy(outcome: PaymentOutcome): {
  title: string;
  body: string;
  tryAgain: boolean;
} {
  switch (outcome) {
    case "failed":
      return {
        title: "Payment failed",
        body: "The payment did not go through. If your bank shows a cut, it should come back in 5 to 10 days. Your items are still in the cart.",
        tryAgain: true
      };
    case "pending":
      return {
        title: "Checking your payment",
        body: "If money left your account, do not pay again. Give it a few minutes — the order should show as paid. If it does not, raise a complaint. Do not retry.",
        tryAgain: false
      };
    default:
      return {
        title: "Payment not completed",
        body: "You closed the payment window. We did not charge you. Your items are still in the cart.",
        tryAgain: true
      };
  }
}
