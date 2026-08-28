"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchInventoryReconciliationV4,
  fetchPurchaseCapitalizationClearing,
  formatInrPaise
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingMetricCard,
  AccountingQuickAction,
  AccountingSectionCard,
  AccountingSectionHeader,
  InventoryPageShell,
  InventorySkeleton,
  ZeroLayerEmptyState
} from "@/components/admin/accounting/inventory/inventory-ui";

type Attention = { label: string; href: string; hint?: string };

export default function InventoryAccountingOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layerValue, setLayerValue] = useState<number | null>(null);
  const [bookValue, setBookValue] = useState<number | null>(null);
  const [difference, setDifference] = useState<number | null>(null);
  const [attentionCount, setAttentionCount] = useState<number | null>(null);
  const [awaitingCap, setAwaitingCap] = useState<number | null>(null);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [zeroLayers, setZeroLayers] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [recon, clearing] = await Promise.all([
          fetchInventoryReconciliationV4({ physicalOnly: true, limit: 500 }),
          fetchPurchaseCapitalizationClearing({ limit: 100 }).catch(() => null)
        ]);

        const fc = recon.financialControl as Record<string, number> | undefined;
        const layer = fc?.nativeLayersTotalValueInPaise;
        const book = fc?.inventoryGl1200InPaise;
        const variance = fc?.glVsLayersVarianceInPaise;
        if (typeof layer === "number") setLayerValue(layer);
        if (typeof book === "number") setBookValue(book);
        if (typeof variance === "number") setDifference(variance);

        const statusCounts = (recon.statusCounts as Record<string, number>) ?? {};
        const rows = (recon.rows as Array<Record<string, unknown>>) ?? [];
        const totalLayers = rows.reduce((s, r) => s + Number(r.layerCount ?? 0), 0);
        setZeroLayers(totalLayers === 0 && (layer === 0 || layer == null));

        const items: Attention[] = [];
        const qtyMismatch = statusCounts.QUANTITY_MISMATCH ?? 0;
        const openingNeeded = statusCounts.OPENING_REQUIRED ?? 0;
        const cogsUnposted = statusCounts.COGS_UNPOSTED ?? 0;
        const valueGap = statusCounts.VALUE_DATA_GAP ?? 0;
        const insufficient = statusCounts.INSUFFICIENT_COST_LAYERS ?? 0;
        const returnUnposted = statusCounts.RETURN_COGS_UNPOSTED ?? 0;

        if (qtyMismatch > 0) {
          items.push({
            label: "Items have quantity differences",
            href: "/admin/accounting/inventory/reconciliation?attention=1",
            hint: String(qtyMismatch)
          });
        }
        if (openingNeeded > 0) {
          items.push({
            label: "Opening valuation needed",
            href: "/admin/accounting/inventory/valuation",
            hint: String(openingNeeded)
          });
        }
        if (valueGap > 0 || insufficient > 0) {
          items.push({
            label: "Value data requiring review",
            href: "/admin/accounting/inventory/valuation",
            hint: String(valueGap + insufficient)
          });
        }
        if (cogsUnposted > 0) {
          items.push({
            label: "Orders need cost of goods recorded",
            href: "/admin/accounting/inventory/cogs?find=1",
            hint: String(cogsUnposted)
          });
        }
        if (returnUnposted > 0) {
          items.push({
            label: "Inventory cost reversals needing review",
            href: "/admin/accounting/inventory/reversals?find=1",
            hint: String(returnUnposted)
          });
        }

        let capAwait = 0;
        if (clearing?.rows) {
          const ready = (clearing.rows as Array<Record<string, unknown>>).filter((r) => {
            const st = String(r.status);
            return (
              st === "PARTIALLY_CAPITALIZED" ||
              (Number(r.receivedQuantity) > Number(r.capitalizedQuantity) &&
                Number(r.clearing1210OutstandingInPaise) > 0)
            );
          });
          capAwait = ready.length;
          if (capAwait > 0) {
            items.push({
              label: "Purchases awaiting capitalization",
              href: "/admin/accounting/inventory/capitalization?find=1",
              hint: String(capAwait)
            });
          }
        }
        setAwaitingCap(clearing ? capAwait : null);

        const attentionTotal =
          qtyMismatch +
          openingNeeded +
          cogsUnposted +
          valueGap +
          insufficient +
          returnUnposted +
          capAwait;
        setAttentionCount(attentionTotal);
        setAttention(items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Inventory overview could not be loaded.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <InventoryPageShell
      title="Inventory Accounting"
      subtitle="Track inventory value, compare physical and accounting stock, and record inventory cost movements."
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {loading ? <InventorySkeleton /> : null}

      {!loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccountingMetricCard
              label="Inventory Value"
              value={layerValue != null ? formatInrPaise(layerValue) : "—"}
              hint="From accounting cost layers"
              href="/admin/accounting/inventory/valuation"
            />
            <AccountingMetricCard
              label="Book Inventory"
              value={bookValue != null ? formatInrPaise(bookValue) : "—"}
              hint="Inventory Asset in the general ledger"
              href="/admin/accounting/inventory/valuation"
            />
            <AccountingMetricCard
              label="Difference"
              value={difference != null ? formatInrPaise(difference) : "—"}
              hint="Book inventory minus cost layers"
              href="/admin/accounting/inventory/reconciliation"
            />
            <AccountingMetricCard
              label="Items Needing Attention"
              value={attentionCount != null ? String(attentionCount) : "—"}
              hint={
                awaitingCap != null && awaitingCap > 0
                  ? `${awaitingCap} purchases awaiting capitalization`
                  : "Reconciliation and posting exceptions"
              }
              href="/admin/accounting/inventory/reconciliation?attention=1"
            />
          </div>

          {zeroLayers ? (
            <div className="space-y-3">
              <ZeroLayerEmptyState showOpeningLink />
              <p className="text-center text-xs">
                <Link
                  href="/admin/accounting/inventory/opening"
                  className="font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                >
                  Review Opening Balances
                </Link>
                {" · "}
                <Link
                  href="/admin/accounting/opening"
                  className="font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                >
                  Advanced Opening Balances
                </Link>
              </p>
            </div>
          ) : null}

          <AccountingSectionCard>
            <AccountingSectionHeader title="Needs Attention" />
            {attention.length === 0 ? (
              <AccountingEmptyState title="Inventory accounting is up to date." />
            ) : (
              <ul className="space-y-2">
                {attention.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ebe4db] bg-[#faf5ec]/50 px-3 py-2.5 text-sm transition-colors hover:bg-white"
                    >
                      <span className="font-medium text-[#2c2420]">
                        {item.hint ? `${item.hint} ` : ""}
                        {item.label}
                      </span>
                      <span className="text-xs font-semibold text-[#1c352a]">Review →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </AccountingSectionCard>

          <AccountingSectionCard>
            <AccountingSectionHeader title="Quick Actions" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <AccountingQuickAction
                href="/admin/accounting/inventory/valuation"
                label="Review Inventory Value"
                hint="SKU quantities and values"
              />
              <AccountingQuickAction
                href="/admin/accounting/inventory/reconciliation"
                label="Review Differences"
                hint="Physical vs accounting stock"
              />
              <AccountingQuickAction
                href="/admin/accounting/inventory/capitalization?find=1"
                label="Find Purchases to Record"
                hint="Inventory purchases worklist"
              />
              <AccountingQuickAction
                href="/admin/accounting/inventory/cogs?find=1"
                label="Find COGS to Record"
                hint="Paid orders needing cost"
              />
              <AccountingQuickAction
                href="/admin/accounting/inventory/reversals?find=1"
                label="Review Returns"
                hint="Eligible cost reversals"
              />
            </div>
          </AccountingSectionCard>
        </>
      ) : null}
    </InventoryPageShell>
  );
}
