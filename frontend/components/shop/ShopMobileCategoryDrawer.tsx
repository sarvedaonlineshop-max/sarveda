"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { CategoryNode } from "@/lib/types";
import { drawerTransition, overlayVariants } from "@/lib/motion";
import { defaultOpenBranchSlug, sortShopCategories } from "@/lib/shop-categories";

import { CategoryNavTree } from "./CategoryNavTree";

type Props = {
  categories: CategoryNode[];
  selectedSlug: string | undefined;
  onSelect: (slug: string | undefined) => void;
};

/** Sits just above the fixed WhatsApp FAB on store pages (mobile). */
const FAB_BOTTOM =
  "bottom-[calc(5.5rem+3.5rem+env(safe-area-inset-bottom,0px))] md:bottom-[calc(var(--storefront-slim-footer-offset)+0.75rem+3.5rem)]";

export function ShopMobileCategoryDrawer({ categories, selectedSlug, onSelect }: Props) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => sortShopCategories(categories), [categories]);
  const [openSlug, setOpenSlug] = useState<string | null>(() =>
    defaultOpenBranchSlug(sorted, selectedSlug)
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const next = defaultOpenBranchSlug(sorted, selectedSlug);
    setOpenSlug((current) => (current === next ? current : next));
  }, [selectedSlug, sorted]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function openBranch(slug: string) {
    setOpenSlug(slug);
  }

  function selectAndClose(slug: string | undefined) {
    onSelect(slug);
    setOpen(false);
  }

  const sheet = mounted
    ? createPortal(
        <AnimatePresence>
          {open ? (
            <div className="fixed inset-0 z-[90] flex flex-col justify-end lg:hidden" aria-hidden={!open}>
              <motion.button
                type="button"
                className="absolute inset-0 bg-stone-950/45"
                aria-label="Close products menu"
                onClick={() => setOpen(false)}
                variants={overlayVariants}
                initial={reduceMotion ? false : "initial"}
                animate="animate"
                exit="exit"
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
              />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label="Products"
                className="relative z-10 flex max-h-[78vh] w-full flex-col rounded-t-2xl border border-stone-200 bg-white shadow-2xl"
                initial={reduceMotion ? false : { y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={reduceMotion ? { duration: 0 } : drawerTransition}
              >
                <div className="flex shrink-0 flex-col items-center border-b border-stone-100 px-4 pb-3 pt-2">
                  <div className="mb-2 h-1 w-10 rounded-full bg-stone-300" aria-hidden />
                  <div className="flex w-full items-center justify-between">
                    <div>
                      <h2 className="font-serif text-xl font-semibold text-stone-900">Products</h2>
                      <p className="text-xs text-stone-600">Browse by category</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="flex h-11 min-w-[44px] items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
                      aria-label="Close products menu"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
                  <button
                    type="button"
                    onClick={() => selectAndClose(undefined)}
                    className={`mb-3 flex min-h-[48px] w-full items-center rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors duration-150 ${
                      !selectedSlug
                        ? "border-brand-forest bg-brand-forest/10 text-brand-forest"
                        : "border-brand-cream-dark bg-white text-brand-ink hover:border-brand-gold/50"
                    }`}
                  >
                    All products
                  </button>
                  <div className="rounded-2xl border border-brand-cream-dark bg-white p-4 shadow-card">
                    <CategoryNavTree
                      nodes={sorted}
                      selectedSlug={selectedSlug}
                      depth={0}
                      onSelect={selectAndClose}
                      onNavigate={() => setOpen(false)}
                      openSlug={openSlug}
                      onOpen={openBranch}
                    />
                  </div>
                </div>
              </motion.aside>
            </div>
          ) : null}
        </AnimatePresence>,
        document.body
      )
    : null;

  const fab = mounted
    ? createPortal(
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed right-4 z-50 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-[#1c1c1c] text-white shadow-lg transition hover:scale-105 hover:bg-black lg:hidden ${FAB_BOTTOM}`}
          aria-label="Open products menu"
          aria-expanded={open}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M4 6h16M4 12h16M4 18h10"
            />
          </svg>
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide">Products</span>
        </button>,
        document.body
      )
    : null;

  return (
    <>
      {fab}
      {sheet}
    </>
  );
}
