"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  ZeroLayerEmptyState,
  accountingButtonClass,
  averageRemainingCost,
  inventoryStatusLabel,
  inventoryStatusTone,
  invTd,
  invTh,
  moneyClass
} from "@/components/admin/accounting/inventory/inventory-ui";

type Row = Record<string, unknown>;

export default function InventoryValuationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [zeroLayers, setZeroLayers] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const recon = await fetchInventoryReconciliationV4({ physicalOnly: true, limit: 500 });
      const list = ((recon.rows as Row[]) ?? []).filter(
        (r) => !String(r.classification ?? "").includes("NON_INVENTORY")
      );
      setRows(list);
      const totalLayers = list.reduce((s, r) => s + Number(r.layerCount ?? 0), 0);
      setZeroLayers(totalLayers === 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Valuation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedAvg = useMemo(() => {
    if (!selected) return null;
    return averageRemainingCost(
      Number(selected.nativeInventoryValueInPaise ?? 0),
      Number(selected.nativeLayerQuantity ?? 0)
    );
  }, [selected]);

  return (
    <InventoryPageShell
      title="Inventory Valuation"
      subtitle="Review the quantity and accounting value of inventory currently on hand."
      actions={
        <button type="button" disabled={loading} onClick={() => void load()} className={accountingButtonClass("secondary", true)}>
          Refresh
        </button>
      }
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {loading ? <InventorySkeleton rows={8} /> : null}

      {!loading && zeroLayers ? (
        <div className="space-y-2">
          <ZeroLayerEmptyState showOpeningLink />
          <p className="text-center text-xs">
            <Link
              href="/admin/accounting/inventory/opening"
              className="font-semibold text-[#1c352a] underline-offset-2 hover:underline"
            >
              Review Opening Balances
            </Link>
          </p>
        </div>
      ) : null}

      {!loading && !zeroLayers && rows.length === 0 ? (
        <AccountingEmptyState title="No inventory valuation rows found" />
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="space-y-4">
          <InventoryTableWrap>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={invTh()}>SKU</th>
                  <th className={invTh()}>Product</th>
                  <th className={invTh(true)}>On-hand Qty</th>
                  <th className={invTh(true)}>Accounting Qty</th>
                  <th className={invTh(true)}>Inventory Value</th>
                  <th className={invTh(true)}>Avg Remaining Cost</th>
                  <th className={invTh()}>Status</th>
                  <th className={invTh()}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => {
                  const qty = Number(r.nativeLayerQuantity ?? 0);
                  const val = Number(r.nativeInventoryValueInPaise ?? 0);
                  const avg = averageRemainingCost(val, qty);
                  const status = String(r.openingStatus ?? "");
                  return (
                    <tr key={String(r.variantId)} className="border-t border-[#eee8e0] hover:bg-[#faf5ec]/40">
                      <td className={invTd()}>{String(r.sku)}</td>
                      <td className={invTd()}>{String(r.productName ?? "—")}</td>
                      <td className={`${invTd(true)} tabular-nums`}>{String(r.operationalOnHand)}</td>
                      <td className={`${invTd(true)} tabular-nums`}>{String(qty)}</td>
                      <td className={`${invTd(true)} ${moneyClass()}`}>{formatInrPaise(val)}</td>
                      <td className={`${invTd(true)} tabular-nums`}>
                        {avg != null ? formatInrPaise(avg) : "—"}
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
                          View
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
                title="Inventory detail"
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
              <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <PreviewFact label="Product">{String(selected.productName ?? "—")}</PreviewFact>
                <PreviewFact label="SKU">{String(selected.sku)}</PreviewFact>
                <PreviewFact label="Physical quantity">
                  {String(selected.operationalOnHand)}
                </PreviewFact>
                <PreviewFact label="Accounting quantity">
                  {String(selected.nativeLayerQuantity)}
                </PreviewFact>
                <PreviewFact label="Inventory value" emphasize>
                  {formatInrPaise(Number(selected.nativeInventoryValueInPaise ?? 0))}
                </PreviewFact>
                <PreviewFact label="Difference">
                  {String(selected.quantityVariance ?? "—")} units
                </PreviewFact>
                <PreviewFact label="Status">
                  {inventoryStatusLabel(String(selected.openingStatus))}
                </PreviewFact>
                {selectedAvg != null ? (
                  <PreviewFact label="Average Remaining Cost" emphasize>
                    {formatInrPaise(selectedAvg)}
                  </PreviewFact>
                ) : null}
              </dl>
              <p className="mt-3 text-xs text-[#8a7060]">
                Detailed cost composition is not available in this view. Values reflect remaining
                accounting inventory value for this SKU.
              </p>
            </AccountingSectionCard>
          ) : null}
        </div>
      ) : null}
    </InventoryPageShell>
  );
}
