"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { fetchAccountingStatus } from "@/lib/accounting-api";

/**
 * Compact UAT status strip across accounting pages.
 * Hide after go-live with NEXT_PUBLIC_ACCOUNTING_UAT_MODE=0|false.
 */
export function AccountingUatBanner() {
  const uatOff =
    process.env.NEXT_PUBLIC_ACCOUNTING_UAT_MODE === "0" ||
    process.env.NEXT_PUBLIC_ACCOUNTING_UAT_MODE === "false";
  const [open, setOpen] = useState(false);
  const [cutoverDate, setCutoverDate] = useState<string | null>(null);
  const [productionPostingAllowed, setProductionPostingAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (uatOff) return;
    void (async () => {
      try {
        const s = await fetchAccountingStatus();
        setCutoverDate(s.cutover?.cutoverDate ?? null);
        setProductionPostingAllowed(
          typeof s.productionPostingAllowed === "boolean" ? s.productionPostingAllowed : null
        );
      } catch {
        /* banner still useful without status */
      }
    })();
  }, [uatOff]);

  if (uatOff) return null;

  const goLive =
    cutoverDate && !Number.isNaN(Date.parse(cutoverDate))
      ? new Date(cutoverDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        })
      : null;

  const postingLabel =
    productionPostingAllowed === true ? "ON" : productionPostingAllowed === false ? "OFF" : "—";

  return (
    <div
      role="status"
      className="rounded-[10px] border border-amber-300/70 bg-[#fff8e8] px-3 py-2 text-[13px] text-amber-950"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-semibold tracking-wide">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          ACCOUNTING UAT MODE
        </span>
        <span className="text-amber-900/85">
          Production posting:{" "}
          <strong
            className={
              productionPostingAllowed === false
                ? "font-bold text-amber-950 underline decoration-amber-700/40 underline-offset-2"
                : "font-semibold"
            }
          >
            {postingLabel}
          </strong>
        </span>
        {goLive ? (
          <span className="text-amber-900/85">
            Go-live: <strong className="font-semibold">{goLive}</strong>
          </span>
        ) : (
          <span className="text-amber-900/85">Training data only</span>
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-amber-900/80 hover:bg-amber-100/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-700"
        >
          Details
          <ChevronDown
            size={12}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
            aria-hidden
          />
        </button>
      </div>
      {open ? (
        <p className="mt-2 border-t border-amber-200/80 pt-2 text-[12px] leading-relaxed text-amber-900/90">
          Reports and journals created before cutover are for training only — not official company books.
          Prefer document tags like{" "}
          <code className="rounded bg-amber-100/90 px-1 text-[11px]">TEST-UAT-ACC-*</code>.
        </p>
      ) : null}
    </div>
  );
}
