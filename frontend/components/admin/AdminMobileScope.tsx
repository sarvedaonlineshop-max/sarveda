"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function AdminMobileScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const responsiveEnabled = !pathname.startsWith("/admin/accounting");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!responsiveEnabled) return;
    const root = rootRef.current;
    if (!root) return;

    const focusPill = (button: HTMLElement, behavior: ScrollBehavior = "smooth") => {
      const row = button.closest(".admin-mobile-pill-row") as HTMLElement | null;
      if (!row) return;
      const rowRect = row.getBoundingClientRect();
      const pillRect = button.getBoundingClientRect();
      const edge = 18;
      let delta = 0;
      if (pillRect.right > rowRect.right - edge) delta = pillRect.right - rowRect.right + edge;
      else if (pillRect.left < rowRect.left + edge) delta = pillRect.left - rowRect.left - edge;
      if (delta !== 0) row.scrollBy({ left: delta, behavior });
    };

    const focusActivePill = () => {
      if (window.innerWidth > 767) return;
      root.querySelectorAll(".admin-mobile-pill-row").forEach((row) => {
        const buttons = Array.from(row.querySelectorAll("button")) as HTMLElement[];
        const active = buttons.find((button) => {
          const style = button.getAttribute("style") ?? "";
          return style.includes("linear-gradient") || style.includes("font-weight: 700") || button.getAttribute("aria-selected") === "true";
        });
        if (active) focusPill(active, "auto");
      });
    };

    window.setTimeout(focusActivePill, 60);

    const onClick = (event: Event) => {
      if (window.innerWidth > 767) return;
      const target = event.target as HTMLElement | null;
      const button = target?.closest(".admin-mobile-pill-row button") as HTMLElement | null;
      if (!button) return;
      window.setTimeout(() => focusPill(button), 40);
    };
    root.addEventListener("click", onClick);

    return () => root.removeEventListener("click", onClick);
  }, [pathname, responsiveEnabled]);

  return (
    <div
      ref={rootRef}
      data-admin-mobile={responsiveEnabled ? "true" : "false"}
      data-admin-path={pathname}
      className={responsiveEnabled ? "admin-mobile-scope" : undefined}
    >
      {children}
    </div>
  );
}
