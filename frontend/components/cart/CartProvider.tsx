"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useRouter } from "next/navigation";

import { fetchMe } from "@/lib/auth-client";
import {
  type CartApiItem,
  type CartApiResponse,
  cartGet,
  cartRemove,
  cartUpdate,
  mergeGuestCartSession,
  preserveCartItemOrder,
  resolveCartPricingCountry,
  setAccountCartOnly
} from "@/lib/cart-api";
import { PRICING_ZONE_CHANGED } from "@/lib/pricing-zone";

type CartUiState = {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  goToCart: () => void;
};

type CartDataState = {
  items: CartApiItem[];
  subtotalInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  coupon: import("@/lib/cart-api").CartCouponInfo | null;
  couponRejected: import("@/lib/cart-api").CartCouponRejected | null;
  currency: string;
  itemCount: number;
  isDigitalOnly: boolean;
  loading: boolean;
  error: string | null;
  refreshCart: (shippingCountry?: string, checkoutEmail?: string) => Promise<void>;
  decreaseLine: (variantId: string) => Promise<void>;
  increaseLine: (variantId: string) => Promise<void>;
  removeLine: (variantId: string) => Promise<void>;
  isCartMutating: boolean;
};

const CartUiContext = createContext<CartUiState | null>(null);
const CartDataContext = createContext<CartDataState | null>(null);

export function useCartUi(): CartUiState {
  const ctx = useContext(CartUiContext);
  if (!ctx) throw new Error("useCartUi must be used within CartProvider");
  return ctx;
}

export function useCartData(): CartDataState {
  const ctx = useContext(CartDataContext);
  if (!ctx) throw new Error("useCartData must be used within CartProvider");
  return ctx;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<CartApiItem[]>([]);
  const [subtotalInPaise, setSubtotalInPaise] = useState(0);
  const [discountInPaise, setDiscountInPaise] = useState(0);
  const [totalInPaise, setTotalInPaise] = useState(0);
  const [coupon, setCoupon] = useState<import("@/lib/cart-api").CartCouponInfo | null>(null);
  const [couponRejected, setCouponRejected] = useState<
    import("@/lib/cart-api").CartCouponRejected | null
  >(null);
  const [currency, setCurrency] = useState("INR");
  const [itemCount, setItemCount] = useState(0);
  const [isDigitalOnly, setIsDigitalOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingVariantId, setMutatingVariantId] = useState<string | null>(null);

  const itemsRef = useRef<CartApiItem[]>([]);
  const cartVersionRef = useRef(0);
  const authSyncedRef = useRef(false);

  const applyCartResponse = useCallback((data: CartApiResponse, version?: number) => {
    if (version != null && version !== cartVersionRef.current) return;
    setItems((prev) => {
      const ordered = preserveCartItemOrder(prev, data.items);
      itemsRef.current = ordered;
      return ordered;
    });
    setSubtotalInPaise(data.subtotalInPaise);
    setDiscountInPaise(data.discountInPaise ?? 0);
    setTotalInPaise(data.totalInPaise ?? data.subtotalInPaise);
    setCoupon(data.coupon ?? null);
    setCouponRejected(data.couponRejected ?? null);
    setCurrency(data.currency ?? "INR");
    setItemCount(data.itemCount ?? data.items.reduce((n, i) => n + i.quantity, 0));
    setIsDigitalOnly(Boolean(data.isDigitalOnly));
    setLoading(false);
    setError(null);
  }, []);

  const refreshCart = useCallback(
    async (shippingCountry?: string, checkoutEmail?: string) => {
      const version = ++cartVersionRef.current;
      try {
        setError(null);
        const data = await cartGet(shippingCountry, checkoutEmail);
        applyCartResponse(data, version);
      } catch (e) {
        if (version !== cartVersionRef.current) return;
        setError(e instanceof Error ? e.message : "Cart failed to load");
        setItems([]);
        itemsRef.current = [];
        setSubtotalInPaise(0);
        setDiscountInPaise(0);
        setTotalInPaise(0);
        setCoupon(null);
        setCouponRejected(null);
        setCurrency("INR");
        setItemCount(0);
        setIsDigitalOnly(false);
      } finally {
        if (version === cartVersionRef.current) setLoading(false);
      }
    },
    [applyCartResponse]
  );

  const applyMutationResult = useCallback(
    (data: CartApiResponse | undefined, version: number) => {
      if (data?.items) {
        applyCartResponse(data, version);
      }
    },
    [applyCartResponse]
  );

  const setLineQuantity = useCallback(
    async (variantId: string, quantity: number) => {
      if (mutatingVariantId) return;
      const version = ++cartVersionRef.current;
      setMutatingVariantId(variantId);
      try {
        const data =
          quantity < 1 ? await cartRemove(variantId) : await cartUpdate(variantId, quantity);
        applyMutationResult(data, version);
      } catch (err) {
        await refreshCart();
        throw err;
      } finally {
        setMutatingVariantId(null);
      }
    },
    [mutatingVariantId, applyMutationResult, refreshCart]
  );

  const decreaseLine = useCallback(
    async (variantId: string) => {
      const line = itemsRef.current.find((i) => i.variantId === variantId);
      if (!line) return;
      try {
        await setLineQuantity(variantId, line.quantity - 1);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update cart");
      }
    },
    [setLineQuantity]
  );

  const increaseLine = useCallback(
    async (variantId: string) => {
      const line = itemsRef.current.find((i) => i.variantId === variantId);
      if (!line) return;
      if (line.maxQuantity != null && line.quantity >= line.maxQuantity) return;
      try {
        await setLineQuantity(variantId, line.quantity + 1);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not update cart");
      }
    },
    [setLineQuantity]
  );

  const removeLine = useCallback(
    async (variantId: string) => {
      if (mutatingVariantId) return;
      const version = ++cartVersionRef.current;
      setMutatingVariantId(variantId);
      try {
        const data = await cartRemove(variantId);
        applyMutationResult(data, version);
      } catch (err) {
        await refreshCart();
        alert(err instanceof Error ? err.message : "Could not remove item");
      } finally {
        setMutatingVariantId(null);
      }
    },
    [mutatingVariantId, applyMutationResult, refreshCart]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await fetchMe();
        if (cancelled) return;
        if (user) {
          authSyncedRef.current = true;
          const merged = await mergeGuestCartSession();
          if (cancelled) return;
          if (merged) {
            applyCartResponse(merged);
            return;
          }
          setAccountCartOnly(true);
          await refreshCart();
          return;
        }
        authSyncedRef.current = false;
        setAccountCartOnly(false);
        await refreshCart();
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError("Cart failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCartResponse, refreshCart]);

  useEffect(() => {
    const onZoneChange = () => {
      void refreshCart(resolveCartPricingCountry());
    };
    window.addEventListener(PRICING_ZONE_CHANGED, onZoneChange);
    return () => window.removeEventListener(PRICING_ZONE_CHANGED, onZoneChange);
  }, [refreshCart]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<CartApiResponse | undefined>).detail;
      if (detail?.items) {
        applyCartResponse(detail);
      }
    };
    window.addEventListener("sarveda-cart-changed", onChange);
    return () => window.removeEventListener("sarveda-cart-changed", onChange);
  }, [applyCartResponse]);

  useEffect(() => {
    const onAuthChange = (event: Event) => {
      void (async () => {
        const user = (event as CustomEvent<{ id: string } | null>).detail;
        if (user) {
          authSyncedRef.current = true;
          const merged = await mergeGuestCartSession();
          if (merged) {
            applyCartResponse(merged);
            return;
          }
          setAccountCartOnly(true);
          await refreshCart();
          return;
        }
        authSyncedRef.current = false;
        setItems([]);
        itemsRef.current = [];
        setSubtotalInPaise(0);
        setDiscountInPaise(0);
        setTotalInPaise(0);
        setCoupon(null);
        setItemCount(0);
        setIsDigitalOnly(false);
        await refreshCart();
      })();
    };
    window.addEventListener("sarveda-auth-changed", onAuthChange);
    return () => window.removeEventListener("sarveda-auth-changed", onAuthChange);
  }, [applyCartResponse, refreshCart]);

  const goToCart = useCallback(() => {
    router.push("/cart");
  }, [router]);

  const openDrawer = goToCart;
  const closeDrawer = useCallback(() => {}, []);

  useEffect(() => {
    const onOpen = () => goToCart();
    window.addEventListener("sarveda-open-cart", onOpen);
    return () => window.removeEventListener("sarveda-open-cart", onOpen);
  }, [goToCart]);

  const uiValue = useMemo(
    () => ({
      drawerOpen: false,
      openDrawer,
      closeDrawer,
      goToCart
    }),
    [openDrawer, closeDrawer, goToCart]
  );

  const dataValue = useMemo(
    () => ({
      items,
      subtotalInPaise,
      discountInPaise,
      totalInPaise,
      coupon,
      couponRejected,
      currency,
      itemCount,
      isDigitalOnly,
      loading,
      error,
      refreshCart,
      decreaseLine,
      increaseLine,
      removeLine,
      isCartMutating: mutatingVariantId != null
    }),
    [
      items,
      subtotalInPaise,
      discountInPaise,
      totalInPaise,
      coupon,
      couponRejected,
      currency,
      itemCount,
      isDigitalOnly,
      loading,
      error,
      refreshCart,
      decreaseLine,
      increaseLine,
      removeLine,
      mutatingVariantId
    ]
  );

  return (
    <CartUiContext.Provider value={uiValue}>
      <CartDataContext.Provider value={dataValue}>{children}</CartDataContext.Provider>
    </CartUiContext.Provider>
  );
}
