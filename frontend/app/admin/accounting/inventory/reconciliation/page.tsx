"use client";

import { useEffect, useState } from "react";
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

const ATTENTION = new Set([
  "QUANTITY_MISMATCH",
  "VALUE_DATA_GAP",
  "OPENING_REQUIRED",
  "COGS_UNPOSTED",
  "INSUFFICIENT_COST_LAYERS",
  "RETURN_COGS_UNPOSTED",
  "NEGATIVE_STOCK",
  "ERROR"
]);

export default function InventoryReconciliationPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const attentionOnly = searchParams.get("attention") === "1";

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const recon = await fetchInventoryReconciliationV4({ physicalOnly: true, limit: 500 });
      let list = (recon.rows as Row[]) ?? [];
      if (attentionOnly) {
        list = list.filter((r) => ATTENTION.has(String(r.openingStatus ?? "")));
      }
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconciliation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attentionOnly]);

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

      {!loading && rows.length === 0 ? (
        <AccountingEmptyState
          title={
            attentionOnly
              ? "No inventory differences found"
              : "No inventory differences found"
          }
          description={
            attentionOnly
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
                    <tr key={String(r.variantId)} className="border-t border-[#eee8e0] hover:bg-[#faf5ec]/40">
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
                The physical quantity differs from the quantity represented by accounting cost
                layers. Review the related inventory transactions before making accounting changes.
                This screen does not post adjustments.
              </p>
            </AccountingSectionCard>
          ) : null}
        </div>
      ) : null}
    </InventoryPageShell>
  );
}
