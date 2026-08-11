"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Read a query param without `useSearchParams()`.
 * Next.js soft-nav + Suspense around useSearchParams was leaving /shop stuck on skeletons.
 */
export function useLocationQueryParam(key: string, serverValue = ""): string {
  const pathname = usePathname();
  const [value, setValue] = useState(serverValue);

  useEffect(() => {
    const read = () => {
      const next = new URLSearchParams(window.location.search).get(key) ?? "";
      setValue((prev) => (prev === next ? prev : next));
    };
    read();

    window.addEventListener("popstate", read);
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      push(...args);
      queueMicrotask(read);
    };
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      replace(...args);
      queueMicrotask(read);
    };
    return () => {
      window.removeEventListener("popstate", read);
      history.pushState = push;
      history.replaceState = replace;
    };
  }, [key, pathname, serverValue]);

  return value;
}
