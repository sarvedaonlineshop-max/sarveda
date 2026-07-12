"use client";

import { createContext, useContext, useMemo, useState } from "react";

type ProductsMeta = {
  loaded: number;
  total: number;
};

type ShopProductsMetaContextValue = ProductsMeta & {
  setProductsMeta: (meta: ProductsMeta) => void;
};

const ShopProductsMetaContext = createContext<ShopProductsMetaContextValue | null>(null);

export function ShopProductsMetaProvider({ children }: { children: React.ReactNode }) {
  const [meta, setProductsMeta] = useState<ProductsMeta>({ loaded: 0, total: 0 });
  const value = useMemo(
    () => ({
      ...meta,
      setProductsMeta
    }),
    [meta]
  );

  return <ShopProductsMetaContext.Provider value={value}>{children}</ShopProductsMetaContext.Provider>;
}

export function useShopProductsMeta(): ShopProductsMetaContextValue {
  const ctx = useContext(ShopProductsMetaContext);
  if (!ctx) {
    throw new Error("useShopProductsMeta must be used within ShopProductsMetaProvider");
  }
  return ctx;
}
