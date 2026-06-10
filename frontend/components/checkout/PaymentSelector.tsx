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
import { trackInitiateCheckout } from "@/lib/analytics";
import { DEFAULT_DISPLAY_GST_RATE, extractGst } from "@/lib/gst";
import { formatINRFromPaise, formatMinorFromPaise } from "@/lib/money";
import type { ShippingBreakdown } from "@/lib/shipping-rates-api";
import { loadRazorpayScript } from "@/lib/load-razorpay";
import { fetchShippingRatesEstimate } from "@/lib/shipping-rates-api";
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
  isDigitalOnly?: boolean;
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
  isDigitalOnly = false,
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
  const checkoutTracked = useRef(false);
  const isIndia = (form.country ?? "IN").toUpperCase() === "IN";
  const checkoutIdempotencyKey = useMemo(
    () => `${idempotencyKey}:${paymentMode}:${form.country ?? "IN"}`,
    [idempotencyKey, paymentMode, form.country]
  );

  useEffect(() => {
    setPaymentMode(isIndia ? "razorpay" : "stripe");
  }, [isIndia]);

  useEffect(() => {
    payStarted.current = false;
    setErr(null);
  }, [paymentMode]);

  const displayCurrency = isIndia ? "INR" : cartCurrency || shippingCurrency;
  const formatMoney = (minor: number) =>
    isIndia ? formatINRFromPaise(minor) : formatMinorFromPaise(minor, displayCurrency);

  const estimatedShipping = isDigitalOnly
    ? 0
    : paymentMode === "cod" && shippingCodInPaise != null
      ? shippingCodInPaise
      : shippingInPaise ?? 0;
  const merchandiseAfterDiscount = Math.max(0, subtotalInPaise - discountInPaise);
  const { gstInPaise } = extractGst(merchandiseAfterDiscount, DEFAULT_DISPLAY_GST_RATE);
  const estimatedTotal =
    merchandiseAfterDiscount + (isDigitalOnly ? 0 : shippingInPaise != null ? estimatedShipping : 0);

  useEffect(() => {
    if (isDigitalOnly) {
      setShippingInPaise(0);
      setShippingCodInPaise(null);
      setShippingBreakdown(null);
      return;
    }
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
  }, [cartItems, form.country, form.postalCode, paymentMode, isDigitalOnly]);

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
      payStarted.current = false;
      setBusy(false);
      setProcessing(false);
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
              goSuccess(orderNumber, false);
            } catch {
              const polled = await pollUntilPaidOrTerminal(order.orderNumber, form.email, 30_000);
              if (polled === "PAID") {
                goSuccess(order.orderNumber, false);
              } else if (polled === "CANCELLED") {
                goFailure(order.orderNumber, "Payment was not completed");
              } else {
                payStarted.current = false;
                setErr(
                  "We could not confirm payment immediately. Your cart is unchanged. If money was debited, your order will update within a few minutes."
                );
              }
            }
          } catch (e) {
            payStarted.current = false;
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
    if (!checkoutTracked.current) {
      checkoutTracked.current = true;
      trackInitiateCheckout(
        shippingInPaise != null ? estimatedTotal : merchandiseAfterDiscount,
        displayCurrency
      );
    }

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
      const raw =
        e instanceof CheckoutApiError ? e.message : e instanceof Error ? e.message : "Checkout failed";
      setErr(
        raw.toLowerCase().includes("route not found")
          ? "Checkout is temporarily unavailable. Please refresh the page and try again."
          : raw
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
    rzpReady,
    estimatedTotal,
    merchandiseAfterDiscount,
    shippingInPaise,
    displayCurrency
  ]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm md:p-6">
      <h2 className="text-xl font-semibold text-stone-900">Order summary</h2>

      {cartItems.length > 0 ? (
        <ul className="mt-4 space-y-2 border-b border-stone-100 pb-4 text-sm">
          {cartItems.map((item) => (
            <li key={item.variantId} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-stone-900 line-clamp-2">{item.productName}</p>
                {item.variantLabel ? (
                  <p className="text-xs text-stone-500">{item.variantLabel}</p>
                ) : null}
                <p className="text-xs text-stone-500">Qty {item.quantity}</p>
              </div>
              <p className="shrink-0 font-medium text-stone-800">
                {formatMoney(item.unitPriceInPaise * item.quantity)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <dl className="mt-4 space-y-2 border-b border-stone-100 pb-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-stone-600">Subtotal ({itemCount} items)</dt>
          <dd className="font-medium text-stone-900">{formatMoney(subtotalInPaise)}</dd>
        </div>
        {discountInPaise > 0 ? (
          <div className="flex justify-between gap-4 text-emerald-800">
            <dt>Coupon discount</dt>
            <dd className="font-medium">−{formatMoney(discountInPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-stone-600">Shipping</dt>
          <dd className="text-right font-medium text-stone-900">
            {isDigitalOnly ? (
              <span className="text-emerald-700">Free (digital)</span>
            ) : shippingLoading ? (
              <span className="text-stone-400">Calculating…</span>
            ) : shippingInPaise != null ? (
              formatMoney(estimatedShipping)
            ) : (
              <span className="text-xs text-stone-500">
                {isIndia ? "Enter PIN to estimate" : "Enter address to estimate"}
              </span>
            )}
          </dd>
        </div>
        {paymentMode === "cod" && shippingCodInPaise != null && shippingCodInPaise !== shippingInPaise ? (
          <p className="text-xs text-amber-800">COD delivery rates applied to shipping.</p>
        ) : null}
        {isIndia ? (
          <div
            style={{
              borderTop: "1px solid var(--brand-cream-dark)",
              paddingTop: "8px",
              marginTop: "4px"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "11px",
                color: "var(--brand-muted)"
              }}
            >
              <span>GST included ({DEFAULT_DISPLAY_GST_RATE}%)</span>
              <span>₹{(gstInPaise / 100).toLocaleString("en-IN")}</span>
            </div>
            <p
              style={{
                fontSize: "10px",
                color: "var(--brand-muted)",
                marginTop: "2px"
              }}
            >
              All prices are GST-inclusive. Tax invoice emailed after order.
            </p>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 pt-2 text-base">
          <dt className="font-semibold text-stone-900">Estimated total</dt>
          <dd className="font-serif font-semibold text-amber-800">
            {shippingInPaise != null
              ? formatMoney(estimatedTotal)
              : formatMoney(merchandiseAfterDiscount)}
            <span className="block text-xs font-sans font-normal text-stone-500">GST included</span>
          </dd>
        </div>
      </dl>

      {isIndia && !resumeOrderNumber ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-semibold text-stone-800">Payment method</legend>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              paymentMode === "razorpay"
                ? "border-stone-900 bg-stone-50 ring-1 ring-stone-900"
                : "border-stone-200 hover:border-stone-300"
            }`}
          >
            <input
              type="radio"
              name="paymentMode"
              className="mt-1"
              checked={paymentMode === "razorpay"}
              onChange={() => setPaymentMode("razorpay")}
            />
            <span>
              <span className="font-medium text-stone-900">Pay online now</span>
              <span className="mt-0.5 block text-xs text-stone-600">UPI, cards, netbanking via Razorpay</span>
            </span>
          </label>
          {!isDigitalOnly ? (
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              paymentMode === "cod"
                ? "border-stone-900 bg-stone-50 ring-1 ring-stone-900"
                : "border-stone-200 hover:border-stone-300"
            }`}
          >
            <input
              type="radio"
              name="paymentMode"
              className="mt-1"
              checked={paymentMode === "cod"}
              onChange={() => setPaymentMode("cod")}
            />
            <span>
              <span className="font-medium text-stone-900">Cash on delivery (COD)</span>
              <span className="mt-0.5 block text-xs text-stone-600">Pay when the courier delivers your order</span>
            </span>
          </label>
          ) : null}
        </fieldset>
      ) : !resumeOrderNumber ? (
        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-semibold text-stone-800">Payment method</legend>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              paymentMode === "stripe"
                ? "border-stone-900 bg-stone-50 ring-1 ring-stone-900"
                : "border-stone-200 hover:border-stone-300"
            }`}
          >
            <input
              type="radio"
              name="paymentMode"
              className="mt-1"
              checked={paymentMode === "stripe"}
              onChange={() => setPaymentMode("stripe")}
            />
            <span>
              <span className="font-medium text-stone-900">Card (Stripe)</span>
              <span className="mt-0.5 block text-xs text-stone-600">Visa, Mastercard, Amex — secure checkout</span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              paymentMode === "paypal"
                ? "border-stone-900 bg-stone-50 ring-1 ring-stone-900"
                : "border-stone-200 hover:border-stone-300"
            }`}
          >
            <input
              type="radio"
              name="paymentMode"
              className="mt-1"
              checked={paymentMode === "paypal"}
              onChange={() => setPaymentMode("paypal")}
            />
            <span>
              <span className="font-medium text-stone-900">PayPal</span>
              <span className="mt-0.5 block text-xs text-stone-600">Pay with your PayPal balance or linked card</span>
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
        <p className="mt-4 text-sm font-medium text-amber-800" role="status">
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
        className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-stone-900 py-3.5 text-base font-semibold tracking-wide text-amber-400 shadow-lg transition-colors hover:bg-amber-700 hover:text-white disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600"
      >
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
      </button>
    </div>
  );
}
