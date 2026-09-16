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

    const markPillRows = () => {
      root.querySelectorAll(".admin-mobile-pill-row").forEach((el) => el.classList.remove("admin-mobile-pill-row"));

      if (pathname === "/admin/orders") {
        const page = root.querySelector("main > div");
        const rows = page ? Array.from(page.children).slice(0, 2) : [];
        rows.forEach((row) => row.classList.add("admin-mobile-pill-row"));
      } else if (pathname === "/admin/shipments") {
        const row = root.querySelector("main > div > div:first-child");
        row?.classList.add("admin-mobile-pill-row");
      } else if (pathname.startsWith("/admin/chats")) {
        const labels = new Set(["Unread", "WhatsApp", "Contact", "Corporate", "Course", "Event", "Insights", "All"]);
        const buttons = Array.from(root.querySelectorAll("aside button"));
        const filterButton = buttons.find((button) => labels.has((button.textContent ?? "").trim()));
        filterButton?.parentElement?.classList.add("admin-mobile-pill-row");
      }
    };

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

    markPillRows();
    const observer = new MutationObserver(markPillRows);
    observer.observe(root, { childList: true, subtree: true });

    const onClick = (event: Event) => {
      if (window.innerWidth > 767) return;
      const target = event.target as HTMLElement | null;
      const button = target?.closest(".admin-mobile-pill-row button") as HTMLElement | null;
      if (!button) return;
      window.setTimeout(() => focusPill(button), 30);
    };
    root.addEventListener("click", onClick);

    return () => {
      observer.disconnect();
      root.removeEventListener("click", onClick);
    };
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
