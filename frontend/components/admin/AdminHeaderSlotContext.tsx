"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";

export type AdminHeaderSlot = {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  afterSearch?: ReactNode;
  actions?: ReactNode;
};

type AdminHeaderSlotContextValue = {
  slot: AdminHeaderSlot | null;
  setSlot: (slot: AdminHeaderSlot | null) => void;
};

const AdminHeaderSlotContext = createContext<AdminHeaderSlotContextValue | null>(null);

export function AdminHeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlotState] = useState<AdminHeaderSlot | null>(null);
  const setSlot = useCallback((next: AdminHeaderSlot | null) => {
    setSlotState(next);
  }, []);
  const value = useMemo(() => ({ slot, setSlot }), [slot, setSlot]);
  return (
    <AdminHeaderSlotContext.Provider value={value}>{children}</AdminHeaderSlotContext.Provider>
  );
}

export function useAdminHeaderSlot() {
  return useContext(AdminHeaderSlotContext);
}

/** Register page-specific header search / actions while mounted. */
export function useRegisterAdminHeaderSlot(
  build: () => AdminHeaderSlot | null,
  deps: ReadonlyArray<unknown>
) {
  const ctx = useAdminHeaderSlot();
  // Build during render so refs/event handlers stay owned by the page component.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const slot = useMemo(build, deps);

  useEffect(() => {
    if (!ctx) return;
    ctx.setSlot(slot);
    return () => ctx.setSlot(null);
  }, [ctx, slot]);
}
