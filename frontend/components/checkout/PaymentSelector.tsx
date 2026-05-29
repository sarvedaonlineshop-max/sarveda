"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import type { CartApiItem } from "@/lib/cart-api";
import type { CheckoutAddressForm } from "@/components/checkout/AddressFields";
import { validateCheckoutFormDetailed } from "@/lib/checkout-validation";
import { formatINRFromPaise, formatMinorFromPaise } from "@/lib/money";
import type { ShippingBreakdown } from "@/lib/shipping-rates-api";
import { loadRazorpayScript } from "@/lib/load-razorpay";
import { fetchShippingRatesEstimate } from "@/lib/shipping-rates-api";
import {
  checkoutSummaryBoxClass,
  paymentOptionClass
} from "@/lib/checkout-ui";
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

type PaymentMode = "razorpay" | "cod" | "stripe" | "paypal";

function resumeMatchesMode(order: CreateOrderResponse, mode: PaymentMode): boolean {
  switch (mode) {
    case "stripe":
      return order.paymentMethod === "stripe" && Boolean(order.stripeCheckoutUrl);
    case "paypal":
      return order.paymentMethod === "paypal" && Boolean(order.paypalApprovalUrl);
    case "cod":
      return order.paymentMethod === "cod" || Boolean(order.codConfirmed);
    case "razorpay":
      return order.paymentMethod === "razorpay" && Boolean(order.rzpOrderId && order.razorpayKeyId);
    default:
      return false;
  }
}

type Props = {
  rzpReady: boolean;
  idempotencyKey: string;
  form: CreateOrderBody;
  addressForm: CheckoutAddressForm;
  cartItems: CartApiItem[];
  subtotalInPaise: number;
  discountInPaise?: number;
  cartCurrency: string;
  itemCount: number;
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
  cartItems,
  subtotalInPaise,
  discountInPaise = 0,
  cartCurrency,
  itemCount,
  onRefreshCart,
  onCheckoutCompleting,
  onFieldErrors,
  resumeOrderNumber
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("razorpay");
  const [shippingInPaise, setShippingInPaise] = useState<number | null>(null);
  const [shippingCodInPaise, setShippingCodInPaise] = useState<number | null>(null);
  const [shippingCurrency, setShippingCurrency] = useState("INR");
  const [shippingBreakdown, setShippingBreakdown] = useState<ShippingBreakdown | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const payStarted = useRef(false);
  const isIndia = (form.country ?? "IN").toUpperCase() === "IN";
  const checkoutIdempotencyKey = useMemo(
    () => `${idempotencyKey}:${paymentMode}:${form.country ?? "IN"}`,
    [idempotencyKey, paymentMode, form.country]
  );

  useEffect(() => {
    setPaymentMode(isIndia ? "razorpay" : "stripe");
  }, [isIndia]);

  const displayCurrency = isIndia ? "INR" : cartCurrency || shippingCurrency;
  const formatMoney = (minor: number) =>
    isIndia ? formatINRFromPaise(minor) : formatMinorFromPaise(minor, displayCurrency);

  const estimatedShipping =
    paymentMode === "cod" && shippingCodInPaise != null ? shippingCodInPaise : shippingInPaise ?? 0;
  const merchandiseAfterDiscount = Math.max(0, subtotalInPaise - discountInPaise);
  const estimatedTotal =
    merchandiseAfterDiscount + (shippingInPaise != null ? estimatedShipping : 0);

  useEffect(() => {
    if (cartItems.length === 0) {
      setShippingInPaise(null);
      setShippingCodInPaise(null);
      return;
    }
    const pin = form.postalCode.replace(/\D/g, "").slice(0, 6);
    if (form.country === "IN" && pin.length !== 6) {
      setShippingInPaise(null);
      setShippingCodInPaise(null);
      return;
    }
    const handle = window.setTimeout(() => {
      setShippingLoading(true);
      void fetchShippingRatesEstimate({
        country: form.country ?? "IN",
        pincode: form.postalCode,
        variantIds: cartItems.map((i) => i.variantId),
        quantities: cartItems.map((i) => i.quantity)
      })
        .then((r) => {
          setShippingInPaise(r.standardShippingInMinorUnits);
          setShippingCodInPaise(r.withCodInMinorUnits);
          setShippingCurrency(r.currency);
          setShippingBreakdown(
            paymentMode === "cod" && r.breakdown?.withCod
              ? r.breakdown.withCod
              : r.breakdown?.standard ?? null
          );
        })
        .catch(() => {
          setShippingInPaise(null);
          setShippingCodInPaise(null);
        })
        .finally(() => setShippingLoading(false));
    }, 400);
    return () => window.clearTimeout(handle);
  }, [cartItems, form.country, form.postalCode, paymentMode]);

  const goSuccess = useCallback(
    (orderNumber: string, cod: boolean) => {
      clearPendingCheckout();
      clearSession();
      onCheckoutCompleting();
      const q = new URLSearchParams({
        orderNumber,
        email: form.email.trim().toLowerCase()
      });
      if (cod) q.set("cod", "1");
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
    (order: CreateOrderResponse & { razorpayKeyId: string; rzpOrderId: string }) => {
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
        theme: { color: "#5B3E9B" },
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
              goSuccess(orderNumber, false);
            } catch {
              const polled = await pollUntilPaidOrTerminal(order.orderNumber, form.email, 30_000);
              if (polled === "PAID") {
                goSuccess(order.orderNumber, false);
              } else if (polled === "CANCELLED") {
                goFailure(order.orderNumber, "Payment was not completed");
              } else {
                setErr(
                  "We could not confirm payment immediately. Your cart is unchanged. If money was debited, your order will update within a few minutes."
                );
              }
            }
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Verification failed");
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

    const tryResume = async (orderNumber: string): Promise<CreateOrderResponse | null> => {
      try {
        const order = await resumePendingOrder(orderNumber, email);
        if (resumeMatchesMode(order, paymentMode)) {
          return order;
        }
        clearPendingCheckout();
        return null;
      } catch (e) {
        if (e instanceof CheckoutApiError && e.code === "ORDER_NOT_PAYABLE") {
          clearPendingCheckout();
        }
        return null;
      }
    };

    if (resumeTarget && (!pending || pending.email === email)) {
      const resumed = await tryResume(resumeTarget);
      if (resumed) return resumed;
    }

    if (pending && pending.email === email && pending.orderNumber !== resumeTarget) {
      const resumed = await tryResume(pending.orderNumber);
      if (resumed) return resumed;
    }

    if (pending && pending.email === email && !resumeMatchesMode(pending, paymentMode)) {
      clearPendingCheckout();
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
        codDelivery: paymentMode === "cod",
        paymentMethod: paymentMode
      },
      checkoutIdempotencyKey
    );
  }, [form, checkoutIdempotencyKey, paymentMode, resumeOrderNumber]);

  const onSubmit = useCallback(async () => {
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
      if (paymentMode === "cod") {
        setProcessing(true);
        const order = await resolvePayableOrder();
        if (order.codConfirmed || order.paymentMethod === "cod") {
          goSuccess(order.orderNumber, true);
          return;
        }
        throw new Error("COD checkout is not available for this order.");
      }

      if (paymentMode === "stripe") {
        setProcessing(true);
        const order = await resolvePayableOrder();
        if (order.stripeCheckoutUrl) {
          savePendingCheckout(order, form.email);
          window.location.href = order.stripeCheckoutUrl;
          return;
        }
        throw new Error(
          order.paymentMethod === "stripe"
            ? "Stripe checkout could not be started. Please try again."
            : `This order is set up for ${order.paymentMethod}. Switch payment method or start checkout again.`
        );
      }

      if (paymentMode === "paypal") {
        setProcessing(true);
        const order = await resolvePayableOrder();
        if (order.paypalApprovalUrl) {
          savePendingCheckout(order, form.email);
          window.location.href = order.paypalApprovalUrl;
          return;
        }
        throw new Error(
          order.paymentMethod === "paypal"
            ? "PayPal checkout could not be started. Please try again."
            : `This order is set up for ${order.paymentMethod}. Switch payment method or start checkout again.`
        );
      }

      const ready = rzpReady || (await loadRazorpayScript());
      if (!ready) {
        throw new Error("Payment gateway did not load. Check your connection and try again.");
      }
      const order = await resolvePayableOrder();
      if (order.codConfirmed) {
        goSuccess(order.orderNumber, true);
        return;
      }
      if (!order.rzpOrderId || !order.razorpayKeyId) {
        throw new Error("Payment session missing. Please try again.");
      }
      openRazorpay(order as CreateOrderResponse & { razorpayKeyId: string; rzpOrderId: string });
    } catch (e) {
      payStarted.current = false;
      setErr(
        e instanceof CheckoutApiError ? e.message : e instanceof Error ? e.message : "Checkout failed"
      );
      setBusy(false);
      setProcessing(false);
    }
  }, [
    addressForm,
    busy,
    form.email,
    goSuccess,
    onFieldErrors,
    openRazorpay,
    paymentMode,
    processing,
    resolvePayableOrder,
    rzpReady
  ]);

  return (
    <div className={checkoutSummaryBoxClass}>
      <h2 className="display-text text-[22px] font-normal text-brand-ink">Order summary</h2>

      <dl className="mt-4 space-y-2 border-b border-[rgba(196,176,232,0.22)] pb-4 text-[13px]">
        <div className="flex justify-between gap-4">
          <dt className="font-light text-brand-mid">Subtotal ({itemCount} items)</dt>
          <dd className="price-text font-medium text-brand-ink">{formatMoney(subtotalInPaise)}</dd>
        </div>
        {discountInPaise > 0 ? (
          <div className="flex justify-between gap-4">
            <dt className="font-light text-brand-mid">Coupon discount</dt>
            <dd className="price-text font-medium text-brand-green">−{formatMoney(discountInPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="font-light text-brand-mid">Shipping</dt>
          <dd className="price-text text-right font-medium text-brand-ink">
            {shippingLoading ? (
              <span className="text-brand-muted">Calculating…</span>
            ) : shippingInPaise != null ? (
              formatMoney(estimatedShipping)
            ) : (
              <span className="text-xs font-light text-brand-muted">
                {isIndia ? "Enter PIN to estimate" : "Enter address to estimate"}
              </span>
            )}
          </dd>
        </div>
        {paymentMode === "cod" && shippingCodInPaise != null && shippingCodInPaise !== shippingInPaise ? (
          <p className="text-xs text-brand-mid">COD delivery rates applied to shipping.</p>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-[rgba(196,176,232,0.22)] pt-3">
          <dt className="font-light text-brand-mid">Estimated total</dt>
          <dd className="price-text text-[15px] font-semibold text-brand-ink">
            {shippingInPaise != null
              ? formatMoney(estimatedTotal)
              : formatMoney(merchandiseAfterDiscount)}
            <span className="mt-0.5 block text-xs font-light text-brand-muted">GST included</span>
          </dd>
        </div>
      </dl>

      {isIndia && !resumeOrderNumber ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-[10px] font-normal uppercase tracking-[0.12em] text-brand-mid">
            Payment method
          </legend>
          <label className={paymentOptionClass(paymentMode === "razorpay")}>
            <input
              type="radio"
              name="paymentMode"
              className="mt-1"
              checked={paymentMode === "razorpay"}
              onChange={() => setPaymentMode("razorpay")}
            />
            <span>
              <span className="font-medium text-brand-ink">Pay online now</span>
              <span className="mt-0.5 block text-xs font-light text-brand-mid">UPI, cards, netbanking via Razorpay</span>
            </span>
          </label>
          <label className={paymentOptionClass(paymentMode === "cod")}>
            <input
              type="radio"
              name="paymentMode"
              className="mt-1"
              checked={paymentMode === "cod"}
              onChange={() => setPaymentMode("cod")}
            />
            <span>
              <span className="font-medium text-brand-ink">Cash on delivery (COD)</span>
              <span className="mt-0.5 block text-xs font-light text-brand-mid">Pay when the courier delivers your order</span>
            </span>
          </label>
        </fieldset>
      ) : !resumeOrderNumber ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-[10px] font-normal uppercase tracking-[0.12em] text-brand-mid">
            Payment method
          </legend>
          <label className={paymentOptionClass(paymentMode === "stripe")}>
            <input
              type="radio"
              name="paymentMode"
              className="mt-1"
              checked={paymentMode === "stripe"}
              onChange={() => setPaymentMode("stripe")}
            />
            <span>
              <span className="font-medium text-brand-ink">Card (Stripe)</span>
              <span className="mt-0.5 block text-xs text-brand-mid">Visa, Mastercard, Amex — secure checkout</span>
            </span>
          </label>
          <label className={paymentOptionClass(paymentMode === "paypal")}>
            <input
              type="radio"
              name="paymentMode"
              className="mt-1"
              checked={paymentMode === "paypal"}
              onChange={() => setPaymentMode("paypal")}
            />
            <span>
              <span className="font-medium text-brand-ink">PayPal</span>
              <span className="mt-0.5 block text-xs font-light text-brand-mid">Pay with your PayPal balance or linked card</span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {err ? (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50/80 p-3 text-sm text-red-800" role="alert">
          {err}
        </div>
      ) : null}

      {processing ? (
        <p className="mt-4 text-sm font-medium text-brand-violet" role="status">
          {paymentMode === "cod" ? "Placing your order…" : "Confirming payment…"}
        </p>
      ) : null}

      <button
        type="button"
        disabled={
          busy ||
          processing ||
          (paymentMode === "razorpay" && !rzpReady && !busy)
        }
        onClick={() => void onSubmit()}
        className="price-text mt-6 flex min-h-[52px] w-full flex-col items-center justify-center rounded-xl bg-brand-violet-deep py-3.5 text-base font-semibold tracking-wide text-white transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>
          {busy || processing
            ? "Please wait…"
            : paymentMode === "cod"
              ? "Place order (COD)"
              : paymentMode === "stripe"
                ? "Continue to Stripe"
                : paymentMode === "paypal"
                  ? "Continue to PayPal"
                  : !rzpReady
                    ? "Loading payment…"
                    : "Pay now"}
        </span>
        {shippingInPaise != null && !busy && !processing ? (
          <span className="mt-0.5 text-sm font-medium opacity-90">
            {formatMoney(estimatedTotal)}
          </span>
        ) : null}
      </button>
    </div>
  );
}
