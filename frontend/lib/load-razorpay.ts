const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loadPromise: Promise<boolean> | null = null;

function hasRazorpay(): boolean {
  return typeof window !== "undefined" && "Razorpay" in window && Boolean((window as Window & { Razorpay?: unknown }).Razorpay);
}

export function loadRazorpayScript(timeoutMs = 15_000): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }
  if (hasRazorpay()) {
    return Promise.resolve(true);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve) => {
    const finish = (ok: boolean) => {
      resolve(ok);
      loadPromise = null;
    };
    const timer = window.setTimeout(() => finish(hasRazorpay()), timeoutMs);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SRC}"]`);

    const onReady = () => {
      window.clearTimeout(timer);
      finish(hasRazorpay());
    };

    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => finish(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SRC;
    script.async = true;
    script.onload = onReady;
    script.onerror = () => finish(false);
    document.body.appendChild(script);
  });

  return loadPromise;
}
