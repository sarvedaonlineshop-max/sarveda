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
            maxWidth: "100%",
            overflow: "hidden"
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
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <h1
              style={{
                margin: 0,
                fontSize: "23px",
                fontWeight: 700,
                color: "#faf5ec",
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                whiteSpace: "nowrap"
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <div
                style={{
                  margin: "2px 0 0",
                  fontSize: "13px",
                  lineHeight: 1.25,
                  color: "#a8c4b0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
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
