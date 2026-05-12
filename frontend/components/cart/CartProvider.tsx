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

import { useIsMobile } from "@/hooks/useIsMobile";
import { type CartApiItem, cartGet } from "@/lib/cart-api";

import { CartDrawer } from "./CartDrawer";

type CartUiState = {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
};

type CartDataState = {
  items: CartApiItem[];
  subtotalInPaise: number;
  itemCount: number;
  loading: boolean;
  error: string | null;
  refreshCart: () => Promise<void>;
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
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [items, setItems] = useState<CartApiItem[]>([]);
  const [subtotalInPaise, setSubtotalInPaise] = useState(0);
  const [itemCount, setItemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshCart = useCallback(async () => {
    try {
      setError(null);
      const data = await cartGet();
      setItems(data.items);
      setSubtotalInPaise(data.subtotalInPaise);
      setItemCount(data.itemCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cart failed to load");
      setItems([]);
      setSubtotalInPaise(0);
      setItemCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  useEffect(() => {
    const onChange = () => void refreshCart();
    window.addEventListener("sarveda-cart-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("sarveda-cart-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refreshCart]);

  const openDrawer = useCallback(() => {
    if (isMobile) {
      router.push("/cart");
      return;
    }
    setDrawerOpen(true);
  }, [isMobile, router]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    const onOpen = () => {
      if (isMobile) {
        router.push("/cart");
        return;
      }
      setDrawerOpen(true);
    };
    window.addEventListener("sarveda-open-cart", onOpen);
    return () => window.removeEventListener("sarveda-open-cart", onOpen);
  }, [isMobile, router]);

  useEffect(() => {
    if (drawerOpen && !isMobile) {
      void refreshCart();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen, isMobile, refreshCart]);

  const uiValue = useMemo(
    () => ({
      drawerOpen,
      openDrawer,
      closeDrawer
    }),
    [drawerOpen, openDrawer, closeDrawer]
  );

  const dataValue = useMemo(
    () => ({
      items,
      subtotalInPaise,
      itemCount,
      loading,
      error,
      refreshCart
    }),
    [items, subtotalInPaise, itemCount, loading, error, refreshCart]
  );

  return (
    <CartUiContext.Provider value={uiValue}>
      <CartDataContext.Provider value={dataValue}>
        {children}
        {!isMobile ? <CartDrawer open={drawerOpen} onClose={closeDrawer} /> : null}
      </CartDataContext.Provider>
    </CartUiContext.Provider>
  );
}
