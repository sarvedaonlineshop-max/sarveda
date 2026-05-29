"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { useRouter } from "next/navigation";

import { type CartApiItem, type CartApiResponse, cartGet } from "@/lib/cart-api";

type CartUiState = {
  /** @deprecated drawer removed — navigates to /cart */
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
  currency: string;
  itemCount: number;
  loading: boolean;
  error: string | null;
  refreshCart: (shippingCountry?: string, checkoutEmail?: string) => Promise<void>;
};

const CartUiContext = createContext<CartUiState | null>(null);
const CartDataContext = createContext<CartDataState | null>(null);

export function useCartUi(): CartUiState {
  const ctx = useContext(CartUiContext);
  if (!ctx) {
    throw new Error("useCartUi must be used within CartProvider");
  }
  return ctx;
}

export function useCartData(): CartDataState {
  const ctx = useContext(CartDataContext);
  if (!ctx) {
    throw new Error("useCartData must be used within CartProvider");
  }
  return ctx;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<CartApiItem[]>([]);
  const [subtotalInPaise, setSubtotalInPaise] = useState(0);
  const [discountInPaise, setDiscountInPaise] = useState(0);
  const [totalInPaise, setTotalInPaise] = useState(0);
  const [coupon, setCoupon] = useState<import("@/lib/cart-api").CartCouponInfo | null>(null);
  const [currency, setCurrency] = useState("INR");
  const [itemCount, setItemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyCartResponse = useCallback((data: CartApiResponse) => {
    setItems(data.items);
    setSubtotalInPaise(data.subtotalInPaise);
    setDiscountInPaise(data.discountInPaise ?? 0);
    setTotalInPaise(data.totalInPaise ?? data.subtotalInPaise);
    setCoupon(data.coupon ?? null);
    setCurrency(data.currency ?? "INR");
    setItemCount(data.itemCount ?? data.items.reduce((n, i) => n + i.quantity, 0));
    setLoading(false);
    setError(null);
  }, []);

  const refreshCart = useCallback(async (shippingCountry?: string, checkoutEmail?: string) => {
    try {
      setError(null);
      const data = await cartGet(shippingCountry, checkoutEmail);
      applyCartResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cart failed to load");
      setItems([]);
      setSubtotalInPaise(0);
      setDiscountInPaise(0);
      setTotalInPaise(0);
      setCoupon(null);
      setCurrency("INR");
      setItemCount(0);
    } finally {
      setLoading(false);
    }
  }, [applyCartResponse]);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<CartApiResponse | undefined>).detail;
      if (detail?.items) {
        applyCartResponse(detail);
        return;
      }
      void refreshCart();
    };
    window.addEventListener("sarveda-cart-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("sarveda-cart-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
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
      currency,
      itemCount,
      loading,
      error,
      refreshCart
    }),
    [
      items,
      subtotalInPaise,
      discountInPaise,
      totalInPaise,
      coupon,
      currency,
      itemCount,
      loading,
      error,
      refreshCart
    ]
  );

  return (
    <CartUiContext.Provider value={uiValue}>
      <CartDataContext.Provider value={dataValue}>{children}</CartDataContext.Provider>
    </CartUiContext.Provider>
  );
}
