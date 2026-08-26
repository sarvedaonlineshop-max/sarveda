"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createOpeningBatch,
  downloadOpeningReview,
  fetchOpeningStatus,
  formatInrPaise,
  getOpeningBatch,
  listOpeningBatches,
  openingTemplateUrl,
  postOpeningBatch,
  previewOpeningBatch,
  putOpeningStaging,
  validateOpeningBatch,
  type OpeningBatchDetail,
  type OpeningBatchRow,
  type OpeningStagingPayload,
  type OpeningStatus,
  type OpeningValidationResult
} from "@/lib/accounting-api";
import { AdminAccountingHeader, AdminAccountingNav } from "@/components/admin/accounting/AdminAccountingNav";
import { AdminApiError } from "@/lib/admin-errors";

function formatPaise(p: number | undefined | null) {
  if (p == null) return "—";
  return formatInrPaise(p);
}

function SectionCard({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#1e3a2f]">{title}</h2>
      {children}
    </section>
  );
}

function ValidationChecks({ validation }: { validation: OpeningValidationResult | null }) {
  if (!validation) return <p className="text-sm text-neutral-500">Run Validate or Preview to see checks.</p>;
  const statusColor =
    validation.status === "PASS"
      ? "text-green-700 bg-green-50 border-green-200"
      : validation.status === "WARNING"
        ? "text-amber-800 bg-amber-50 border-amber-200"
        : "text-red-800 bg-red-50 border-red-200";
  return (
    <div className="space-y-3">
      <div className={`inline-flex rounded-md border px-3 py-1 text-sm font-medium ${statusColor}`}>
        {validation.status} — Dr {formatPaise(validation.proposedDebitInPaise)} / Cr{" "}
        {formatPaise(validation.proposedCreditInPaise)}
        {validation.balanced ? " (balanced)" : " (OUT OF BALANCE)"}
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
        {validation.checks.map((c) => (
          <li
            key={c.code}
            className={
              c.status === "FAIL"
                ? "text-red-700"
                : c.status === "WARNING"
                  ? "text-amber-800"
                  : "text-neutral-700"
            }
          >
            <span className="font-mono text-xs">{c.status}</span> {c.code}: {c.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

const TEMPLATE_KINDS = [
  "sku_mapping",
  "inventory",
  "bank",
  "gateway",
  "ap",
  "ar",
  "gst",
  "equity"
] as const;

export default function AccountingOpeningPage() {
  const [status, setStatus] = useState<OpeningStatus | null>(null);
  const [batches, setBatches] = useState<OpeningBatchRow[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batch, setBatch] = useState<OpeningBatchDetail | null>(null);
  const [validation, setValidation] = useState<OpeningValidationResult | null>(null);
  const [proposalLines, setProposalLines] = useState<
    Array<{ accountCode: string; debitInPaise: number; creditInPaise: number; memo: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [stagingJson, setStagingJson] = useState("");

  const loadAll = useCallback(async () => {
    setErr(null);
    try {
      const st = await fetchOpeningStatus();
      setStatus(st);
      if (st.openingBalanceEnabled) {
        const list = await listOpeningBatches(25);
        setBatches(list);
      } else {
        setBatches([]);
      }
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : String(e));
    }
  }, []);

  const loadBatch = useCallback(async (id: string) => {
    const detail = await getOpeningBatch(id);
    setBatch(detail);
    setBatchId(id);
    if (detail.validationSummary && typeof detail.validationSummary === "object") {
      setValidation(detail.validationSummary as unknown as OpeningValidationResult);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (batchId) void loadBatch(batchId).catch(() => undefined);
  }, [batchId, loadBatch]);

  const defaultStaging = useMemo((): OpeningStagingPayload => {
    if (!batch) {
      return {
        skuMappings: [],
        inventoryLines: [],
        bankLines: [],
        gatewayLines: [],
        apLines: [],
        arLines: [],
        gstLines: [],
        equityLines: [],
        arApprovedZero: false
      };
    }
    return {
      skuMappings: batch.skuMappings as OpeningStagingPayload["skuMappings"],
      inventoryLines: batch.inventoryLines as OpeningStagingPayload["inventoryLines"],
      bankLines: batch.bankLines as OpeningStagingPayload["bankLines"],
      gatewayLines: batch.gatewayLines as OpeningStagingPayload["gatewayLines"],
      apLines: batch.apLines as OpeningStagingPayload["apLines"],
      arLines: batch.arLines as OpeningStagingPayload["arLines"],
      gstLines: batch.gstLines as OpeningStagingPayload["gstLines"],
      equityLines: batch.equityLines as OpeningStagingPayload["equityLines"],
      arApprovedZero: batch.arApprovedZero,
      equity3900Reason: batch.equity3900Reason,
      equity3900Reviewer: batch.equity3900Reviewer,
      equity3900Approved: batch.equity3900Approved
    };
  }, [batch]);

  useEffect(() => {
    setStagingJson(JSON.stringify(defaultStaging, null, 2));
  }, [defaultStaging]);

  async function runCreateBatch() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const created = await createOpeningBatch({
        effectiveDate,
        description: description.trim() || undefined,
        source: "ADMIN_UI"
      });
      setBatchId(created.id);
      setMsg(`Created batch ${created.batchNumber}`);
      await loadAll();
      await loadBatch(created.id);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSaveStaging() {
    if (!batchId) {
      setErr("Select or create a batch first");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const body = JSON.parse(stagingJson) as OpeningStagingPayload;
      const updated = await putOpeningStaging(batchId, body);
      setBatch(updated);
      setMsg("Staging saved");
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runValidate() {
    if (!batchId) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await validateOpeningBatch(batchId);
      setValidation(result.validation);
      await loadBatch(batchId);
      setMsg(result.ok ? "Validation passed" : "Validation has failures — review checks");
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!batchId) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await previewOpeningBatch(batchId);
      setValidation(result.validation);
      setProposalLines(result.proposal.lines);
      setMsg(
        result.proposal.totalDebitInPaise === result.proposal.totalCreditInPaise
          ? "Preview balanced"
          : "Preview out of balance"
      );
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runPost() {
    if (!batchId) return;
    if (!window.confirm("Post production opening balance? This is idempotent but irreversible for cutover.")) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const result = await postOpeningBatch(batchId);
      setValidation(result.validation);
      await loadBatch(batchId);
      await loadAll();
      setMsg(
        result.duplicate
          ? `Duplicate-safe replay — journal ${result.journal?.entryNumber ?? "linked"}`
          : `Posted — journal ${result.journal?.entryNumber ?? "created"}`
      );
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runExportReview() {
    if (!batchId) return;
    setBusy(true);
    setErr(null);
    try {
      await downloadOpeningReview(batchId);
      setMsg("Review workbook downloaded");
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const invLines = (batch?.inventoryLines as Array<Record<string, unknown>>) ?? [];
  const bankLines = (batch?.bankLines as Array<Record<string, unknown>>) ?? [];
  const gatewayLines = (batch?.gatewayLines as Array<Record<string, unknown>>) ?? [];
  const apLines = (batch?.apLines as Array<Record<string, unknown>>) ?? [];
  const arLines = (batch?.arLines as Array<Record<string, unknown>>) ?? [];
  const gstLines = (batch?.gstLines as Array<Record<string, unknown>>) ?? [];
  const equityLines = (batch?.equityLines as Array<Record<string, unknown>>) ?? [];
  const skuMappings = (batch?.skuMappings as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="space-y-6 p-6">
      <AdminAccountingHeader
        title="Production Opening / Cutover"
        subtitle="Phase 7B — stage opening balances, validate, preview journal, and post a single cutover batch. Zoho remains authoritative until 7C."
      />
      <AdminAccountingNav />

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {status?.resetNotice ?? "Accounting reset must be performed by authorized operations."}
      </div>

      {err ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}
      {msg ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{msg}</div>
      ) : null}

      <SectionCard title="Cutover Status">
        {status ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Native accounting</dt>
              <dd>{status.nativeAccountingEnabled ? "ON" : "OFF"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Opening balance module</dt>
              <dd>{status.openingBalanceEnabled ? "ON" : "OFF"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Production-like env</dt>
              <dd>{status.productionLike ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Cutover ready (7C)</dt>
              <dd>{status.cutoverReady ? "Yes" : "No"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-neutral-500">Posted opening batch</dt>
              <dd>
                {status.postedOpeningBatch
                  ? `${status.postedOpeningBatch.batchNumber} (${status.postedOpeningBatch.postedAt ?? "—"})`
                  : "None"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-neutral-500">Loading status…</p>
        )}
      </SectionCard>

      <SectionCard title="Opening Batch">
        {!status?.openingBalanceEnabled ? (
          <p className="text-sm text-neutral-600">
            Set <code className="rounded bg-neutral-100 px-1">ACCOUNTING_OPENING_BALANCE_ENABLED=1</code> on the
            backend to create and stage batches.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <label className="text-sm">
                Effective date
                <input
                  type="date"
                  className="ml-2 rounded border border-neutral-300 px-2 py-1"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Description
                <input
                  type="text"
                  className="ml-2 min-w-[200px] rounded border border-neutral-300 px-2 py-1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Cutover workbook ref"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runCreateBatch()}
                className="rounded-md bg-[#1e3a2f] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Create batch
              </button>
            </div>
            <div>
              <label className="text-sm font-medium">Existing batches</label>
              <select
                className="mt-1 block w-full max-w-md rounded border border-neutral-300 px-2 py-2 text-sm"
                value={batchId ?? ""}
                onChange={(e) => setBatchId(e.target.value || null)}
              >
                <option value="">— select —</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.batchNumber} ({b.status}) — {b.effectiveDate.slice(0, 10)}
                  </option>
                ))}
              </select>
            </div>
            {batch ? (
              <p className="text-sm text-neutral-600">
                {batch.batchNumber} · {batch.status} · Dr {formatPaise(batch.totalDebitInPaise)} / Cr{" "}
                {formatPaise(batch.totalCreditInPaise)}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_KINDS.map((kind) => (
                <a
                  key={kind}
                  href={openingTemplateUrl(kind)}
                  className="rounded-md bg-neutral-100 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-200"
                >
                  Template: {kind}
                </a>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {batch ? (
        <>
          <SectionCard title="SKU Mapping">
            {skuMappings.length === 0 ? (
              <p className="text-sm text-neutral-500">No SKU mappings staged.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-neutral-500">
                    <th className="py-1">SKU</th>
                    <th>Match</th>
                    <th>Qty</th>
                    <th>Unit cost</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {skuMappings.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="py-1 font-mono text-xs">{String(r.newSarvedaSku)}</td>
                      <td>{String(r.matchStatus)}</td>
                      <td>{String(r.openingQty)}</td>
                      <td>{formatPaise(Number(r.unitCostInPaise))}</td>
                      <td>{String(r.reviewStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="Inventory">
            {invLines.length === 0 ? (
              <p className="text-sm text-neutral-500">No inventory lines.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-neutral-500">
                    <th className="py-1">SKU</th>
                    <th>Qty</th>
                    <th>Ops onHand</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invLines.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="py-1 font-mono text-xs">{String(r.sku)}</td>
                      <td>{String(r.quantity)}</td>
                      <td>{String(r.operationalOnHand)}</td>
                      <td>{formatPaise(Number(r.totalCostInPaise))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="Banks / Cash">
            {bankLines.length === 0 ? (
              <p className="text-sm text-neutral-500">No bank lines.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-neutral-500">
                    <th className="py-1">Name</th>
                    <th>GL</th>
                    <th>Opening balance</th>
                  </tr>
                </thead>
                <tbody>
                  {bankLines.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="py-1">{String(r.name)}</td>
                      <td className="font-mono text-xs">{String(r.glAccountCode)}</td>
                      <td>{formatPaise(Number(r.openingBookBalanceInPaise))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="Gateway Clearing">
            {gatewayLines.length === 0 ? (
              <p className="text-sm text-neutral-500">No gateway lines.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-neutral-500">
                    <th className="py-1">Provider</th>
                    <th>GL</th>
                    <th>Unsettled</th>
                  </tr>
                </thead>
                <tbody>
                  {gatewayLines.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td>{String(r.provider)}</td>
                      <td className="font-mono text-xs">{String(r.glAccountCode)}</td>
                      <td>{formatPaise(Number(r.unsettledAmountInPaise))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="AP">
            {apLines.length === 0 ? (
              <p className="text-sm text-neutral-500">No AP lines.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-neutral-500">
                    <th className="py-1">Vendor</th>
                    <th>Bill</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {apLines.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td>{String(r.vendorName)}</td>
                      <td>{String(r.billNumber)}</td>
                      <td>{formatPaise(Number(r.outstandingInPaise))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="AR">
            {batch.arApprovedZero && arLines.length === 0 ? (
              <p className="text-sm text-green-700">AR approved zero — no opening receivables.</p>
            ) : arLines.length === 0 ? (
              <p className="text-sm text-neutral-500">No AR lines (set arApprovedZero if intentionally zero).</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-neutral-500">
                    <th className="py-1">Customer</th>
                    <th>Invoice</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {arLines.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td>{String(r.customerName)}</td>
                      <td>{String(r.invoiceReference)}</td>
                      <td>{formatPaise(Number(r.outstandingInPaise))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="GST">
            {gstLines.length === 0 ? (
              <p className="text-sm text-neutral-500">No GST opening lines.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-neutral-500">
                    <th className="py-1">Account</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {gstLines.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="font-mono text-xs">{String(r.accountCode)}</td>
                      <td>{formatPaise(Number(r.balanceInPaise))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="Equity">
            {equityLines.length === 0 ? (
              <p className="text-sm text-neutral-500">No equity plug lines.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-neutral-500">
                    <th className="py-1">Account</th>
                    <th>Amount</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {equityLines.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="font-mono text-xs">{String(r.accountCode)}</td>
                      <td>{formatPaise(Number(r.amountInPaise))}</td>
                      <td>{String(r.reason ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="Staging (JSON)">
            <p className="mb-2 text-xs text-neutral-500">
              Edit full staging payload and save before Validate / Preview / Post. Import templates via API or ops
              scripts.
            </p>
            <textarea
              className="h-48 w-full rounded border border-neutral-300 p-2 font-mono text-xs"
              value={stagingJson}
              onChange={(e) => setStagingJson(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !batchId}
              onClick={() => void runSaveStaging()}
              className="mt-2 rounded-md bg-neutral-800 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Save staging
            </button>
          </SectionCard>

          <SectionCard title="Validation">
            <ValidationChecks validation={validation} />
            {proposalLines.length > 0 ? (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">Preview journal lines</h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-neutral-500">
                      <th className="py-1">GL</th>
                      <th>Dr</th>
                      <th>Cr</th>
                      <th>Memo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposalLines.map((l, i) => (
                      <tr key={i} className="border-b border-neutral-100">
                        <td className="font-mono text-xs">{l.accountCode}</td>
                        <td>{l.debitInPaise ? formatPaise(l.debitInPaise) : "—"}</td>
                        <td>{l.creditInPaise ? formatPaise(l.creditInPaise) : "—"}</td>
                        <td className="text-xs">{l.memo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !batchId}
                onClick={() => void runPreview()}
                className="rounded-md bg-neutral-100 px-4 py-2 text-sm hover:bg-neutral-200 disabled:opacity-50"
              >
                Preview
              </button>
              <button
                type="button"
                disabled={busy || !batchId}
                onClick={() => void runValidate()}
                className="rounded-md bg-neutral-100 px-4 py-2 text-sm hover:bg-neutral-200 disabled:opacity-50"
              >
                Validate
              </button>
              <button
                type="button"
                disabled={busy || !batchId}
                onClick={() => void runExportReview()}
                className="rounded-md bg-neutral-100 px-4 py-2 text-sm hover:bg-neutral-200 disabled:opacity-50"
              >
                Export Review
              </button>
              <button
                type="button"
                disabled={busy || !batchId || batch.status === "POSTED"}
                onClick={() => void runPost()}
                className="rounded-md bg-[#1e3a2f] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Post Opening
              </button>
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
