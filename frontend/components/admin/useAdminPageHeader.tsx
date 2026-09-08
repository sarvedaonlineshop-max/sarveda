"use client";

import type { ReactNode } from "react";

import { useRegisterAdminHeaderSlot } from "@/components/admin/AdminHeaderSlotContext";

export type AdminPageHeaderConfig = {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Right-side controls in the top header (CTAs). */
  actions?: ReactNode;
};

/**
 * Moves page hero copy into the admin top bar and hides global header search.
 * Use instead of the dark green gradient banner under the header.
 */
export function useAdminPageHeader(
  build: () => AdminPageHeaderConfig,
  deps: ReadonlyArray<unknown>
) {
  useRegisterAdminHeaderSlot(() => {
    const { title, subtitle, icon, actions } = build();
    return {
      hideSearch: true,
      leading: (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            minWidth: 0,
            maxWidth: "920px"
          }}
        >
          {icon ? (
            <span
              style={{
                fontSize: "22px",
                lineHeight: 1,
                flexShrink: 0
              }}
              aria-hidden
            >
              {icon}
            </span>
          ) : null}
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--admin-text, #1c352a)",
                lineHeight: 1.2,
                letterSpacing: "-0.02em"
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                style={{
                  margin: "3px 0 0",
                  fontSize: "13px",
                  lineHeight: 1.4,
                  color: "var(--admin-text-muted, #4a6b58)"
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
      ),
      actions: actions ?? undefined
    };
  }, deps);
}
