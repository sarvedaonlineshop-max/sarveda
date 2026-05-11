"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import {
  CheckoutApiError,
  createOrder,
  pollUntilPaidOrTerminal,
  verifyRazorpayPayment,
  type CreateOrderBody,
  type CreateOrderResponse
} from "@/lib/checkout-api";
import { clearSession } from "@/lib/cart-api";
import { formatINRFromPaise } from "@/lib/money";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (ev: string, fn: (err?: { error?: { description?: string; code?: string } }) => void) => void;
    };
  }
}

function mapRazorpayClientError(err?: { error?: { description?: string; code?: string } }): string {
  const code = err?.error?.code ?? "";
  const desc = (err?.error?.description ?? "").toLowerCase();
  if (desc.includes("timeout") || code.includes("TIMEOUT")) {
    return "Connection timeout. Your money is safe — please retry or check your order status in a few minutes.";
  }
  if (desc.includes("insufficient")) {
    return "Insufficient funds. Please try another payment method.";
  }
  if (desc.includes("declined") || desc.includes("authentication")) {
    return "Your card was declined. Please try another card.";
  }
  if (code === "BAD_REQUEST_ERROR") {
    return err?.error?.description || "We could not process this payment. Please check your details and try again.";
  }
  if (code === "GATEWAY_ERROR") {
    return "The payment gateway is temporarily unavailable. Please try again shortly.";
  }
  if (code === "SERVER_ERROR") {
    return "Something went wrong. Please retry in a moment.";
  }
  return err?.error?.description || "Payment could not be completed. You can retry without placing a new order.";
}

type Props = {
  rzpReady: boolean;
  idempotencyKey: string;
  form: CreateOrderBody;
  subtotalInPaise: number;
  itemCount: number;
  onRefreshCart: () => Promise<void>;
};

export function PaymentSelector({
  rzpReady,
  idempotencyKey,
  form,
  subtotalInPaise,
  itemCount,
  onRefreshCart
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const payStarted = useRef(false);

  const goSuccess = useCallback(
    (orderNumber: string) => {
      const q = new URLSearchParams({
        orderNumber,
        email: form.email.trim().toLowerCase()
      });
      router.push(`/order/confirmed?${q.toString()}`);
    },
    [form.email, router]
  );

  const goFailure = useCallback(
    (orderNumber: string, reason: string) => {
      const q = new URLSearchParams({
        orderNumber,
        email: form.email.trim().toLowerCase(),
        reason
      });
      router.push(`/payment-failed?${q.toString()}`);
    },
    [form.email, router]
  );

  const openRazorpay = useCallback(
    (order: CreateOrderResponse) => {
      if (!window.Razorpay) {
        setErr("Payment script not loaded. Please refresh the page.");
        setBusy(false);
        setProcessing(false);
        payStarted.current = false;
        return;
      }

      const rzp = new window.Razorpay({
        key: order.razorpayKeyId,
        amount: order.amountInPaise,
        currency: order.currency,
        order_id: order.rzpOrderId,
        name: "Sarveda",
        description: `Order ${order.orderNumber}`,
        prefill: {
          email: form.email.trim(),
          contact: form.phone.trim()
        },
        theme: { color: "#44403c" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setProcessing(true);
          try {
            try {
              const { orderNumber } = await verifyRazorpayPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              });
              goSuccess(orderNumber);
            } catch {
              const polled = await pollUntilPaidOrTerminal(order.orderNumber, form.email, 30_000);
              if (polled === "PAID") {
                goSuccess(order.orderNumber);
              } else if (polled === "CANCELLED") {
                goFailure(order.orderNumber, "Payment was not completed");
              } else {
                setErr(
                  "We could not confirm payment immediately. If money was debited, your order will appear as paid within a few minutes — or contact support."
                );
              }
            }
          } catch (e) {
            const msg =
              e instanceof CheckoutApiError
                ? e.message
                : e instanceof Error
                  ? e.message
                  : "Verification failed";
            setErr(msg);
          } finally {
            setProcessing(false);
            setBusy(false);
            payStarted.current = false;
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setProcessing(false);
            payStarted.current = false;
          }
        }
      });

      const rzpAny = rzp as unknown as {
        on?: (ev: string, fn: (failure?: { error?: { description?: string; code?: string } }) => void) => void;
      };
      rzpAny.on?.("payment.failed", (failure) => {
        setErr(mapRazorpayClientError(failure));
        setProcessing(false);
        setBusy(false);
        payStarted.current = false;
      });

      rzp.open();
    },
    [form.email, form.phone, goFailure, goSuccess]
  );

  const onPay = useCallback(async () => {
    if (busy || payStarted.current || processing) return;
    setErr(null);
    setBusy(true);
    payStarted.current = true;
    try {
      const order = await createOrder(
        {
          email: form.email.trim(),
          phone: form.phone.trim(),
          shippingFullName: form.shippingFullName.trim(),
          line1: form.line1.trim(),
          line2: form.line2?.trim() || undefined,
          city: form.city.trim(),
          state: form.state.trim(),
          postalCode: form.postalCode.trim(),
          country: form.country ?? "IN"
        },
        idempotencyKey
      );

      await onRefreshCart();
      clearSession();

      openRazorpay(order);
    } catch (e) {
      payStarted.current = false;
      const msg =
        e instanceof CheckoutApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Checkout failed";
      setErr(msg);
      setBusy(false);
    }
  }, [busy, form, idempotencyKey, onRefreshCart, openRazorpay, processing]);

  return (
    <div className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
      <h2 className="font-serif text-xl font-semibold text-stone-900">Order summary</h2>
      <p className="mt-1 text-sm text-stone-500">
        {itemCount} items · {formatINRFromPaise(subtotalInPaise)}
      </p>
      <p className="mt-2 text-xs text-stone-500">GST included · Secure payment via Razorpay</p>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50/80 p-3 text-sm text-red-800" role="alert">
          {err}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-amber-400"
              onClick={() => {
                setErr(null);
                void onPay();
              }}
            >
              Retry payment
            </button>
          </div>
        </div>
      ) : null}

      {processing ? (
        <p className="mt-4 text-sm font-medium text-amber-800" role="status">
          Confirming payment with our server…
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy || processing || !rzpReady}
        onClick={() => void onPay()}
        className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-stone-900 py-3.5 text-base font-semibold tracking-wide text-amber-400 shadow-lg transition-colors hover:bg-amber-700 hover:text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
      >
        {!rzpReady ? "Loading payment…" : busy || processing ? "Processing…" : "Pay with Razorpay"}
      </button>
    </div>
  );
}
