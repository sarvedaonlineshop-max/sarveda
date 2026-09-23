"use client";

import { useEffect } from "react";

/**
 * Keep admin chats inside the visible viewport on phones.
 * Android Chrome otherwise scrolls the focused composer into view, which
 * pushes the thread header off-screen and leaves a gap above the keyboard.
 */
export function useAdminChatViewportLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const root = document.documentElement;
    const body = document.body;
    let timers: number[] = [];

    const isMobile = () => window.matchMedia("(max-width: 767px)").matches;

    const pin = () => {
      if (!isMobile()) return;
      window.scrollTo(0, 0);
      root.scrollTop = 0;
      body.scrollTop = 0;
      const vv = window.visualViewport;
      const height = Math.round(vv?.height ?? window.innerHeight);
      root.style.setProperty("--admin-chat-vvh", `${Math.max(height, 1)}px`);
    };

    const pinSoon = () => {
      pin();
      requestAnimationFrame(pin);
      timers.forEach((id) => window.clearTimeout(id));
      timers = [80, 200, 400].map((ms) => window.setTimeout(pin, ms));
    };

    root.classList.add("admin-chat-vv-lock");
    pinSoon();

    const vv = window.visualViewport;
    vv?.addEventListener("resize", pinSoon);
    vv?.addEventListener("scroll", pin);
    window.addEventListener("resize", pinSoon);
    window.addEventListener("orientationchange", pinSoon);
    window.addEventListener("focusin", pinSoon);
    window.addEventListener("focusout", pinSoon);

    return () => {
      vv?.removeEventListener("resize", pinSoon);
      vv?.removeEventListener("scroll", pin);
      window.removeEventListener("resize", pinSoon);
      window.removeEventListener("orientationchange", pinSoon);
      window.removeEventListener("focusin", pinSoon);
      window.removeEventListener("focusout", pinSoon);
      timers.forEach((id) => window.clearTimeout(id));
      root.classList.remove("admin-chat-vv-lock");
      root.style.removeProperty("--admin-chat-vvh");
    };
  }, [enabled]);
}
