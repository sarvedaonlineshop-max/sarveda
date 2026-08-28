"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import {
  discoverInventoryCogsAccounting,
  formatInrPaise,
  postInventoryCogsAccounting,
  previewInventoryCogsAccounting
} from "@/lib/accounting-api";
import { AdminApiError } from "@/lib/admin-errors";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  InventoryPageShell,
  InventoryTableWrap,
  PreviewFact,
  accountingButtonClass,
  accountingInputClass,
  fieldLabelClass,
  humanizeInventoryError,
  invTd,
  invTh,
  moneyClass
} from "@/components/admin/accounting/inventory/inventory-ui";

type Row = Record<string, unknown>;

export default function InventoryCogsPage() {
  const searchParams = useSearchParams();
  const autoFind = useRef(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [findRows, setFindRows] = useState<Row[] | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [insufficientCost, setInsufficientCost] = useState(false);

  async function handleFind() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await discoverInventoryCogsAccounting({ dryRun: true, limit: 25 });
      const results = ((data.results as Row[]) ?? []).filter(
        (r) => r.action === "preview" || r.action === "skipped" || r.orderNumber
      );
      setFindRows(results);
      const eligible = results.filter((r) => r.action === "preview" || r.totalCogsInPaise);
      setMessage(
        eligible.length > 0
          ? `Found ${eligible.length} order${eligible.length === 1 ? "" : "s"} to review.`
          : "No orders currently need cost of goods recorded."
      );
    } catch (e) {
      setError(humanizeInventoryError(e instanceof AdminApiError ? e.message : "Find failed"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoFind.current) return;
    if (searchParams.get("find") === "1") {
      autoFind.current = true;
      void handleFind();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handlePreview(order?: string) {
    const key = (order ?? orderNumber).trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setInsufficientCost(false);
    try {
      setOrderNumber(key);
      const isUuid = /^[0-9a-f-]{36}$/i.test(key);
      const data = await previewInventoryCogsAccounting(
        isUuid ? { orderId: key } : { orderNumber: key }
      );
      setPreview(data);
      const elig = data.eligibility as { code?: string } | undefined;
      if (
        elig?.code === "INSUFFICIENT_COST_LAYERS" ||
        elig?.code === "COST_LAYER_DATA_GAP"
      ) {
        setInsufficientCost(true);
      }
    } catch (e) {
      setPreview(null);
      const msg = e instanceof AdminApiError ? e.message : "Preview failed";
      if (/INSUFFICIENT_COST_LAYERS|COST_LAYER/i.test(msg)) setInsufficientCost(true);
      setError(humanizeInventoryError(msg));
    } finally {
      setBusy(false);
    }
  }

  async function handleRecord() {
    setBusy(true);
    setError(null);
    try {
      const key = orderNumber.trim();
      const isUuid = /^[0-9a-f-]{36}$/i.test(key);
      await postInventoryCogsAccounting(isUuid ? { orderId: key } : { orderNumber: key });
      setConfirmOpen(false);
      setMessage("Cost recorded");
      await handlePreview(key);
    } catch (e) {
      setConfirmOpen(false);
      const msg = e instanceof AdminApiError ? e.message : "Recording failed";
      if (/INSUFFICIENT_COST_LAYERS|COST_LAYER/i.test(msg)) setInsufficientCost(true);
      setError(humanizeInventoryError(msg));
    } finally {
      setBusy(false);
    }
  }

  const eligibility = preview?.eligibility as
    | { eligible?: boolean; code?: string; reason?: string }
    | undefined;
  const snapshot = preview?.snapshot as
    | {
        orderNumber?: string;
        placedAt?: string;
        currency?: string;
        lines?: Array<{
          orderItemId: string;
          skuSnapshot?: string;
          nameSnapshot?: string;
          qtyOrdered?: number;
        }>;
      }
    | undefined;
  const proposal = preview?.proposal as
    | {
        totalCostInPaise?: number;
        items?: Array<{
          orderItemId?: string;
          variantId?: string;
          qtyOrdered?: number;
          totalCostInPaise?: number;
          consumptions?: Array<{ unitCostInPaise: number; quantityConsumed: number }>;
        }>;
      }
    | null
    | undefined;
  const journalProposal = preview?.journalProposal as
    | { totalCogsInPaise?: number }
    | null
    | undefined;

  const totalCost =
    proposal?.totalCostInPaise ?? journalProposal?.totalCogsInPaise ?? 0;

  const lineRows = (proposal?.items ?? []).map((item) => {
    const snapLine = snapshot?.lines?.find((l) => l.orderItemId === item.orderItemId);
    const qty = Number(item.qtyOrdered ?? snapLine?.qtyOrdered ?? 0);
    const total = Number(item.totalCostInPaise ?? 0);
    const unitFromCons = item.consumptions?.[0]?.unitCostInPaise;
    const unit =
      unitFromCons != null
        ? unitFromCons
        : qty > 0
          ? Math.round(total / qty)
          : 0;
    return {
      name: snapLine?.nameSnapshot ?? "—",
      sku: String(
        (item as { skuSnapshot?: string }).skuSnapshot ?? snapLine?.skuSnapshot ?? "—"
      ),
      qty,
      unit,
      total
    };
  });

  const canRecord = Boolean(eligibility?.eligible && totalCost > 0);

  return (
    <InventoryPageShell
      title="Cost of Goods Sold"
      subtitle="Record the inventory cost associated with paid customer orders."
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {message ? <AccountingAlert tone="success">{message}</AccountingAlert> : null}

      <AccountingSectionCard>
        <AccountingSectionHeader
          title="Look up order"
          description="Enter an order number to preview the cost of goods sold entry."
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className={fieldLabelClass()}>Order Number</span>
            <input
              className={accountingInputClass()}
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="SRV-…"
              disabled={busy}
            />
          </label>
          <button
            type="button"
            disabled={busy || !orderNumber.trim()}
            onClick={() => void handlePreview()}
            className={accountingButtonClass("primary")}
          >
            {busy ? "Working…" : "Preview Cost Entry"}
          </button>
          <button
            type="button"
            disabled={busy || !canRecord}
            onClick={() => setConfirmOpen(true)}
            className={accountingButtonClass("secondary")}
          >
            Record Cost of Goods Sold
          </button>
        </div>
        <div className="mt-4 border-t border-[#ebe4db] pt-3">
          <p className="mb-2 text-xs text-[#8a7060]">
            Or scan for paid orders that still need cost of goods recorded.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleFind()}
            className={accountingButtonClass("secondary", true)}
          >
            Find Orders to Record
          </button>
        </div>
      </AccountingSectionCard>

      {insufficientCost ? (
        <AccountingAlert tone="warning" title="Cost information incomplete">
          Accounting does not have enough inventory cost information to record the cost of this
          sale.{" "}
          <Link
            href="/admin/accounting/inventory/valuation"
            className="font-semibold underline-offset-2 hover:underline"
          >
            View inventory valuation
          </Link>
        </AccountingAlert>
      ) : null}

      {findRows && findRows.length > 0 ? (
        <AccountingSectionCard>
          <AccountingSectionHeader title="Orders to Record" />
          <InventoryTableWrap>
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={invTh()}>Order</th>
                  <th className={invTh()}>Status</th>
                  <th className={invTh(true)}>Inventory Cost</th>
                  <th className={invTh()}>Action</th>
                </tr>
              </thead>
              <tbody>
                {findRows.map((r, i) => (
                  <tr key={`${String(r.orderNumber ?? r.orderId)}-${i}`} className="border-t border-[#eee8e0]">
                    <td className={invTd()}>{String(r.orderNumber ?? "—")}</td>
                    <td className={invTd()}>
                      {r.action === "preview"
                        ? "Ready to record"
                        : r.action === "duplicate" || r.action === "posted"
                          ? "Already recorded"
                          : r.action === "skipped"
                            ? inventorySkipLabel(String(r.code ?? ""))
                            : "Needs review"}
                    </td>
                    <td className={`${invTd(true)} ${moneyClass()}`}>
                      {r.totalCogsInPaise != null
                        ? formatInrPaise(Number(r.totalCogsInPaise))
                        : "—"}
                    </td>
                    <td className={invTd()}>
                      {r.orderNumber || r.orderId ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                          onClick={() =>
                            void handlePreview(String(r.orderNumber ?? r.orderId))
                          }
                        >
                          Preview
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </InventoryTableWrap>
        </AccountingSectionCard>
      ) : findRows && findRows.length === 0 ? (
        <AccountingEmptyState title="No orders currently need cost of goods recorded" />
      ) : null}

      {!preview && !findRows ? (
        <AccountingEmptyState
          title="No order selected"
          description="Enter an order number to preview the cost of goods sold entry."
        />
      ) : null}

      {preview ? (
        <div className="space-y-4">
          <AccountingSectionCard>
            <AccountingSectionHeader title="Cost of goods sold preview" />
            <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <PreviewFact label="Order">
                {String(snapshot?.orderNumber ?? orderNumber)}
              </PreviewFact>
              <PreviewFact label="Order Date">
                {snapshot?.placedAt
                  ? new Date(String(snapshot.placedAt)).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric"
                    })
                  : "—"}
              </PreviewFact>
              <PreviewFact label="Items">{String(lineRows.length)}</PreviewFact>
              <PreviewFact label="Total Inventory Cost" emphasize>
                {formatInrPaise(totalCost)}
              </PreviewFact>
            </dl>
            <p className="mt-3 text-sm leading-relaxed text-[#6b5c52]">
              This records the cost of inventory sold and reduces the accounting value of inventory.
              It does not charge the customer or change the sales amount.
            </p>
          </AccountingSectionCard>

          {lineRows.length > 0 ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="Line costs" />
              <InventoryTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={invTh()}>Product</th>
                      <th className={invTh()}>SKU</th>
                      <th className={invTh(true)}>Quantity</th>
                      <th className={invTh(true)}>Cost Basis</th>
                      <th className={invTh(true)}>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineRows.map((item, i) => (
                      <tr key={i} className="border-t border-[#eee8e0]">
                        <td className={invTd()}>{item.name}</td>
                        <td className={invTd()}>{item.sku}</td>
                        <td className={`${invTd(true)} tabular-nums`}>{item.qty || "—"}</td>
                        <td className={`${invTd(true)} ${moneyClass()}`}>
                          {item.unit ? formatInrPaise(item.unit) : "—"}
                        </td>
                        <td className={`${invTd(true)} ${moneyClass()}`}>
                          {item.total ? formatInrPaise(item.total) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </InventoryTableWrap>
            </AccountingSectionCard>
          ) : null}

          {totalCost > 0 ? (
            <AccountingSectionCard>
              <AccountingSectionHeader title="Accounting Impact" />
              <InventoryTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={invTh()}>Account</th>
                      <th className={invTh(true)}>Debit</th>
                      <th className={invTh(true)}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#eee8e0]">
                      <td className={invTd()}>Cost of Goods Sold</td>
                      <td className={`${invTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(totalCost)}
                      </td>
                      <td className={invTd(true)}>—</td>
                    </tr>
                    <tr className="border-t border-[#eee8e0]">
                      <td className={invTd()}>Inventory Asset</td>
                      <td className={invTd(true)}>—</td>
                      <td className={`${invTd(true)} ${moneyClass()}`}>
                        {formatInrPaise(totalCost)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </InventoryTableWrap>
            </AccountingSectionCard>
          ) : null}
        </div>
      ) : null}

      <AdminConfirmModal
        open={confirmOpen}
        title="Record cost of goods sold?"
        message="This creates an accounting entry that records inventory cost for this sale."
        details={[
          `Order: ${String(snapshot?.orderNumber ?? orderNumber)}`,
          `Inventory cost: ${formatInrPaise(totalCost)}`,
          `Items: ${lineRows.length}`
        ]}
        confirmLabel="Record Cost of Goods Sold"
        cancelLabel="Cancel"
        busy={busy}
        onConfirm={() => void handleRecord()}
        onClose={() => setConfirmOpen(false)}
      />
    </InventoryPageShell>
  );
}

function inventorySkipLabel(code: string): string {
  if (code === "ALREADY_POSTED") return "Already recorded";
  if (code === "INSUFFICIENT_COST_LAYERS" || code === "COST_LAYER_DATA_GAP") {
    return "Cost information incomplete";
  }
  if (code === "NO_NATIVE_ORDER_PAID") return "Sales entry not recorded yet";
  if (code === "PRE_CUTOVER") return "Outside accounting cutover";
  if (code === "NON_INVENTORY_ONLY") return "Not inventory";
  return "Needs review";
}
