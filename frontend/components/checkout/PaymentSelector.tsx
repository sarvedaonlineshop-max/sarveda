"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import {
  CheckoutApiError,
  createOrder,
  pollUntilPaidOrTerminal,
  resumePendingOrder,
  verifyRazorpayPayment,
  type CreateOrderBody,
  type CreateOrderResponse
} from "@/lib/checkout-api";
import { clearSession } from "@/lib/cart-api";
import type { CheckoutAddressForm } from "@/components/checkout/AddressFields";
import { validateCheckoutFormDetailed } from "@/lib/checkout-validation";
import { formatINRFromPaise } from "@/lib/money";
import { loadRazorpayScript } from "@/lib/load-razorpay";
import {
  clearPendingCheckout,
  loadPendingCheckout,
  savePendingCheckout
} from "@/lib/pending-checkout";

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
  return err?.error?.description || "Payment could not be completed. Your cart is still saved — you can try again.";
}

type Props = {
  rzpReady: boolean;
  idempotencyKey: string;
  form: CreateOrderBody;
  addressForm: CheckoutAddressForm;
  subtotalInPaise: number;
  itemCount: number;
  codDelivery?: boolean;
  onRefreshCart: () => Promise<void>;
  onCheckoutCompleting: () => void;
  onFieldErrors: (errors: Partial<Record<keyof CheckoutAddressForm, string>>) => void;
  resumeOrderNumber?: string | null;
};

export function PaymentSelector({
  rzpReady,
  idempotencyKey,
  form,
  addressForm,
  subtotalInPaise,
  itemCount,
  onRefreshCart,
  onCheckoutCompleting,
  onFieldErrors,
  resumeOrderNumber,
  codDelivery = false
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [payWithCod, setPayWithCod] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const payStarted = useRef(false);
  const indiaOnly = (form.country ?? "IN").toUpperCase() === "IN";

  const goSuccess = useCallback(
    (orderNumber: string) => {
      clearPendingCheckout();
      clearSession();
      onCheckoutCompleting();
      const q = new URLSearchParams({
        orderNumber,
        email: form.email.trim().toLowerCase()
      });
      router.push(`/order/confirmed?${q.toString()}`);
      void onRefreshCart();
    },
    [form.email, onCheckoutCompleting, onRefreshCart, router]
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
      savePendingCheckout(order, form.email);

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
              await goSuccess(orderNumber);
            } catch {
              const polled = await pollUntilPaidOrTerminal(order.orderNumber, form.email, 30_000);
              if (polled === "PAID") {
                goSuccess(order.orderNumber);
              } else if (polled === "CANCELLED") {
                goFailure(order.orderNumber, "Payment was not completed");
              } else {
                setErr(
                  "We could not confirm payment immediately. Your cart is unchanged. If money was debited, your order will update within a few minutes — or contact support."
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
            goFailure(order.orderNumber, "Payment was cancelled. Your cart is still saved.");
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
      setBusy(false);
    },
    [form.email, form.phone, goFailure, goSuccess]
  );

  const resolvePayableOrder = useCallback(async (): Promise<CreateOrderResponse> => {
    const email = form.email.trim().toLowerCase();
    const pending = loadPendingCheckout();
    const resumeTarget = resumeOrderNumber?.trim() || pending?.orderNumber;

    if (resumeTarget && (!pending || pending.email === email)) {
      try {
        return await resumePendingOrder(resumeTarget, email);
      } catch (e) {
        if (!(e instanceof CheckoutApiError) || e.code !== "NOT_FOUND") {
          if (e instanceof CheckoutApiError && e.code === "ORDER_NOT_PAYABLE") {
            clearPendingCheckout();
          } else if (!(e instanceof CheckoutApiError)) {
            throw e;
          }
        }
      }
    }

    if (pending && pending.email === email) {
      try {
        return await resumePendingOrder(pending.orderNumber, email);
      } catch {
        clearPendingCheckout();
      }
    }

    return createOrder(
      {
        email: form.email.trim(),
        phone: form.phone.trim(),
        shippingFullName: form.shippingFullName.trim(),
        line1: form.line1.trim(),
        line2: form.line2?.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country ?? "IN",
        codDelivery: codDelivery || payWithCod,
        paymentMethod: payWithCod ? "cod" : "razorpay"
      },
      idempotencyKey
    );
  }, [codDelivery, form, idempotencyKey, payWithCod, resumeOrderNumber]);

  const onPay = useCallback(async () => {
    if (busy || payStarted.current || processing) return;
    const validation = validateCheckoutFormDetailed(addressForm);
    if (validation.message) {
      onFieldErrors(validation.fieldErrors);
      setErr(validation.message);
      return;
    }
    onFieldErrors({});
    setErr(null);
    setBusy(true);
    payStarted.current = true;
    try {
      if (payWithCod && indiaOnly) {
        setProcessing(true);
        const order = await resolvePayableOrder();
        if (order.codConfirmed || order.paymentMethod === "cod") {
          goSuccess(order.orderNumber);
          return;
        }
        throw new Error("COD checkout is not available for this order.");
      }
      const ready = rzpReady || (await loadRazorpayScript());
      if (!ready) {
        throw new Error("Payment gateway did not load. Check your connection and try again.");
      }
      const order = await resolvePayableOrder();
      if (order.codConfirmed) {
        goSuccess(order.orderNumber);
        return;
      }
      if (!order.rzpOrderId || !order.razorpayKeyId) {
        throw new Error("Payment session missing. Please try again.");
      }
      openRazorpay(order as CreateOrderResponse & { razorpayKeyId: string; rzpOrderId: string });
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
  }, [addressForm, busy, goSuccess, indiaOnly, onFieldErrors, openRazorpay, payWithCod, processing, resolvePayableOrder, rzpReady]);

  return (
    <div className="rounded-2xl border border-stone-100 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-stone-900">Order summary</h2>
      <p className="mt-1 text-sm text-stone-500">
        {itemCount} items · {formatINRFromPaise(subtotalInPaise)}
      </p>
      <p className="mt-2 text-xs text-stone-500">
        GST included · Your cart stays saved until payment succeeds
      </p>

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

      {indiaOnly ? (
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={payWithCod}
            onChange={(e) => setPayWithCod(e.target.checked)}
          />
          <span>
            <span className="font-semibold text-stone-900">Cash on delivery (COD)</span>
            <span className="mt-0.5 block text-stone-600">
              Pay when your order arrives. COD shipping rates apply.
            </span>
          </span>
        </label>
      ) : null}

      <button
        type="button"
        disabled={busy || processing}
        onClick={() => void onPay()}
        className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-stone-900 py-3.5 text-base font-semibold tracking-wide text-amber-400 shadow-lg transition-colors hover:bg-amber-700 hover:text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
      >
        {!rzpReady && !busy && !processing && !payWithCod
          ? "Loading payment…"
          : busy || processing
            ? "Processing…"
            : payWithCod
              ? "Place COD order"
              : "Pay with Razorpay"}
      </button>
    </div>
  );
}
