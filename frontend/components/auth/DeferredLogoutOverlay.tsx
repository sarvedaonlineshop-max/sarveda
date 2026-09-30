"use client";

import dynamic from "next/dynamic";

import { useAfterFirstPaint } from "@/components/layout/useAfterFirstPaint";

const LogoutTransitionOverlay = dynamic(
  () => import("@/components/auth/LogoutTransitionOverlay").then((m) => m.LogoutTransitionOverlay),
  { ssr: false }
);

/** Keep framer-motion logout overlay off the first-paint JS path. */
export function DeferredLogoutOverlay() {
  const ready = useAfterFirstPaint();
  if (!ready) return null;
  return <LogoutTransitionOverlay />;
}
