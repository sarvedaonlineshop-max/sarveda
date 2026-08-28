"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchInventoryReconciliationV4,
  formatInrPaise
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  InventoryPageShell,
  InventorySkeleton,
  InventoryTableWrap,
  PreviewFact,
  accountingButtonClass,
  inventoryStatusLabel,
  inventoryStatusTone,
  invTd,
  invTh,
  moneyClass
} from "@/components/admin/accounting/inventory/inventory-ui";

type Row = Record<string, unknown>;

type StatusFilter = "all" | "balanced" | "opening" | "qty" | "review";

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "balanced", label: "Balanced" },
  { id: "opening", label: "Opening valuation needed" },
  { id: "qty", label: "Quantity mismatch" },
  { id: "review", label: "Needs review" }
];

const ATTENTION = new Set([
  "QUANTITY_MISMATCH",
  "VALUE_DATA_GAP",
  "OPENING_REQUIRED",
  "COGS_UNPOSTED",
  "INSUFFICIENT_COST_LAYERS",
  "RETURN_COGS_UNPOSTED",
  "NEGATIVE_STOCK",
  "ERROR",
  "SOURCE_CHANGED_AFTER_POST",
  "RESTOCK_WITHOUT_SOURCE_COGS",
  "RETURN_QTY_EXCEEDS_REVERSIBLE_COGS",
  "DATA_GAP"
]);

function matchesFilter(status: string, filter: StatusFilter): boolean {
  const s = status.toUpperCase();
  if (filter === "all") return true;
  if (filter === "balanced") return s === "MATCHED" || s === "OPENING_POSTED";
  if (filter === "opening") return s === "OPENING_REQUIRED";
  if (filter === "qty") return s === "QUANTITY_MISMATCH";
  if (filter === "review") {
    return ATTENTION.has(s) && s !== "QUANTITY_MISMATCH" && s !== "OPENING_REQUIRED";
  }
  return true;
}

export default function InventoryReconciliationPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const attentionOnly = searchParams.get("attention") === "1";
  const [filter, setFilter] = useState<StatusFilter>("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const recon = await fetchInventoryReconciliationV4({ physicalOnly: true, limit: 500 });
      setAllRows((recon.rows as Row[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconciliation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => {
    let list = allRows;
    if (attentionOnly) {
      list = list.filter((r) => ATTENTION.has(String(r.openingStatus ?? "")));
    }
    return list.filter((r) => matchesFilter(String(r.openingStatus ?? ""), filter));
  }, [allRows, filter, attentionOnly]);

  return (
    <InventoryPageShell
      title="Inventory Reconciliation"
      subtitle="Compare physical stock with inventory quantities represented in the accounting records."
      actions={
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className={accountingButtonClass("secondary", true)}
        >
          Refresh
        </button>
      }
    >
      <AccountingAlert tone="info">
        This comparison does not change stock or create accounting entries.
      </AccountingAlert>

      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {loading ? <InventorySkeleton rows={8} /> : null}

      {!loading ? (
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
                  active
                    ? "bg-[#1c352a] text-white"
                    : "border border-[#ebe4db] bg-white text-[#8a7060] hover:bg-[#faf5ec]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <AccountingEmptyState
          title="No inventory differences found"
          description={
            filter !== "all"
              ? "No rows match this status filter."
              : attentionOnly
                ? "Nothing currently needs attention in this comparison."
                : undefined
          }
        />
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="space-y-4">
          <InventoryTableWrap>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={invTh()}>SKU</th>
                  <th className={invTh()}>Product</th>
                  <th className={invTh(true)}>Physical Qty</th>
                  <th className={invTh(true)}>Accounting Qty</th>
                  <th className={invTh(true)}>Difference</th>
                  <th className={invTh(true)}>Inventory Value</th>
                  <th className={invTh()}>Status</th>
                  <th className={invTh()}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => {
                  const status = String(r.openingStatus ?? "");
                  return (
                    <tr
                      key={String(r.variantId)}
                      className="border-t border-[#eee8e0] hover:bg-[#faf5ec]/40"
                    >
                      <td className={invTd()}>{String(r.sku)}</td>
                      <td className={invTd()}>{String(r.productName ?? "—")}</td>
                      <td className={`${invTd(true)} tabular-nums`}>
                        {String(r.operationalOnHand)}
                      </td>
                      <td className={`${invTd(true)} tabular-nums`}>
                        {String(r.nativeLayerQuantity)}
                      </td>
                      <td className={`${invTd(true)} tabular-nums`}>
                        {String(r.quantityVariance)}
                      </td>
                      <td className={`${invTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(Number(r.nativeInventoryValueInPaise ?? 0))}
                      </td>
                      <td className={invTd()}>
                        <AccountingStatusBadge tone={inventoryStatusTone(status)}>
                          {inventoryStatusLabel(status)}
                        </AccountingStatusBadge>
                      </td>
                      <td className={invTd()}>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                          onClick={() => setSelected(r)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </InventoryTableWrap>

          {selected ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title="Difference detail"
                action={
                  <button
                    type="button"
                    className="text-xs text-[#8a7060] underline-offset-2 hover:underline"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                }
              />
              <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <PreviewFact label="Physical Stock">
                  {String(selected.operationalOnHand)} units
                </PreviewFact>
                <PreviewFact label="Accounting Stock">
                  {String(selected.nativeLayerQuantity)} units
                </PreviewFact>
                <PreviewFact label="Difference">
                  {String(selected.quantityVariance)} units
                </PreviewFact>
                <PreviewFact label="Accounting Inventory Value" emphasize>
                  {formatInrPaise(Number(selected.nativeInventoryValueInPaise ?? 0))}
                </PreviewFact>
                <PreviewFact label="Status">
                  {inventoryStatusLabel(String(selected.openingStatus))}
                </PreviewFact>
                <PreviewFact label="SKU">{String(selected.sku)}</PreviewFact>
              </dl>
              <p className="mt-3 text-sm leading-relaxed text-[#6b5c52]">
                The physical quantity differs from the quantity represented in accounting. Review
                the related inventory transactions before making accounting changes. This screen
                does not post adjustments.
              </p>
            </AccountingSectionCard>
          ) : null}
        </div>
      ) : null}
    </InventoryPageShell>
  );
}
