"use client";

import { useCallback, useEffect, useState } from "react";
import {
  blockItc,
  discoverItc,
  fetchGstDataGaps,
  fetchGstLedger,
  fetchGstReconciliation,
  fetchGstReport3b,
  fetchGstReportB2b,
  fetchGstReportB2c,
  fetchGstReportCreditNotes,
  fetchGstReportDataGaps,
  fetchGstReportHsn,
  fetchGstReportIntegrity,
  fetchGstReportOutward,
  fetchGstReportOverview,
  fetchGstReportRates,
  fetchGstStatus,
  fetchItcEvidence,
  fetchItcList,
  fetchItcSummary,
  formatInrPaise,
  gstExportUrl,
  markItcDataGap,
  verifyItc,
  type ItcEvidenceRow,
  type ItcSummary
} from "@/lib/accounting-api";
import { getApiBase } from "@/lib/api";
import { AdminAccountingHeader } from "@/components/admin/accounting/AdminAccountingNav";

type Tab =
  | "overview"
  | "outward"
  | "b2b"
  | "b2c"
  | "credit"
  | "hsn"
  | "itc"
  | "ledger"
  | "recon"
  | "gaps";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "outward", label: "Outward" },
  { id: "b2b", label: "B2B" },
  { id: "b2c", label: "B2C" },
  { id: "credit", label: "Credit Notes" },
  { id: "hsn", label: "HSN" },
  { id: "itc", label: "ITC" },
  { id: "ledger", label: "GST Ledger" },
  { id: "recon", label: "Reconciliation" },
  { id: "gaps", label: "Data Gaps" }
];

export default function GstAccountingPage() {
  const [gstEnabled, setGstEnabled] = useState(false);
  const [reportingEnabled, setReportingEnabled] = useState(false);
  const [reconEnabled, setReconEnabled] = useState(false);
  const [itcEnabled, setItcEnabled] = useState(false);
  const [shippingPolicy, setShippingPolicy] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [ledger, setLedger] = useState<{
    accounts: Array<Record<string, unknown>>;
    aggregates: Record<string, number>;
  } | null>(null);
  const [outward, setOutward] = useState<Record<string, unknown> | null>(null);
  const [b2b, setB2b] = useState<Record<string, unknown> | null>(null);
  const [b2c, setB2c] = useState<Record<string, unknown> | null>(null);
  const [credit, setCredit] = useState<Record<string, unknown> | null>(null);
  const [hsn, setHsn] = useState<Record<string, unknown> | null>(null);
  const [rates, setRates] = useState<Record<string, unknown> | null>(null);
  const [integrity, setIntegrity] = useState<Record<string, unknown> | null>(null);
  const [reportGaps, setReportGaps] = useState<Array<Record<string, unknown>>>([]);
  const [salesRecon, setSalesRecon] = useState<Array<Record<string, unknown>>>([]);
  const [purchaseRecon, setPurchaseRecon] = useState<Array<Record<string, unknown>>>([]);
  const [gaps, setGaps] = useState<Array<Record<string, unknown>>>([]);
  const [itcSummary, setItcSummary] = useState<ItcSummary | null>(null);
  const [itcRows, setItcRows] = useState<ItcEvidenceRow[]>([]);
  const [selected, setSelected] = useState<ItcEvidenceRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const st = await fetchGstStatus();
      setGstEnabled(st.gstEnabled);
      setReportingEnabled(Boolean(st.gstReportingEnabled));
      setReconEnabled(st.gstReconciliationEnabled);
      setItcEnabled(Boolean(st.itcVerificationEnabled ?? st.itcEligibleWorkflow));
      setShippingPolicy(st.shippingGstPolicy);
      if (!st.gstEnabled) return;

      const led = await fetchGstLedger({ month });
      setLedger({ accounts: led.accounts, aggregates: led.aggregates });

      if (st.gstReportingEnabled) {
        const ov = await fetchGstReportOverview({ month });
        setOverview(ov);
        setOutward(await fetchGstReportOutward({ month }));
        setB2b(await fetchGstReportB2b({ month }));
        setB2c(await fetchGstReportB2c({ month }));
        setCredit(await fetchGstReportCreditNotes({ month }));
        setHsn(await fetchGstReportHsn({ month }));
        setRates(await fetchGstReportRates({ month }));
        setIntegrity(await fetchGstReportIntegrity({ month }));
        const g = await fetchGstReportDataGaps({ month });
        setReportGaps(g.gaps);
        await fetchGstReport3b({ month });
      }

      if (st.gstReconciliationEnabled) {
        const sales = await fetchGstReconciliation({ scope: "SALES", limit: 30 });
        setSalesRecon(sales.rows);
        const purch = await fetchGstReconciliation({ scope: "VENDOR_BILLS", limit: 30 });
        const exp = await fetchGstReconciliation({ scope: "EXPENSES", limit: 30 });
        setPurchaseRecon([...purch.rows, ...exp.rows]);
        const g = await fetchGstDataGaps(40);
        setGaps(g.rows);
      }

      if (st.itcVerificationEnabled ?? st.itcEligibleWorkflow) {
        setItcSummary(await fetchItcSummary(month));
        const list = await fetchItcList({ month, limit: 40 });
        setItcRows(list.rows);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const net = overview?.netPosition as Record<string, unknown> | undefined;
  const outwardSupplies = overview?.outwardSupplies as Record<string, number> | undefined;
  const inputTax = overview?.inputTax as Record<string, number> | undefined;

  async function act(kind: "verify" | "block" | "gap", id: string) {
    const reason = window.prompt(kind === "verify" ? "Verification note" : "Reason (required)");
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      if (kind === "verify") await verifyItc(id, reason.trim());
      else if (kind === "block") await blockItc(id, reason.trim());
      else await markItcDataGap(id, reason.trim());
      await load();
      setSelected(await fetchItcEvidence(id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <AdminAccountingHeader title="GST Management Reports" />
      <p className="text-sm text-neutral-600">
        GSTR-style management / reconciliation views — <strong>not</strong> GSTN filing. Shipping:{" "}
        <code className="text-xs">{shippingPolicy || "…"}</code>
      </p>

      {!gstEnabled && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          Set <code>ACCOUNTING_GST_ENABLED=1</code>.
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Month
          <input
            type="month"
            className="ml-2 rounded border px-2 py-1"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh
        </button>
        {reportingEnabled && (
          <a
            className="rounded border px-3 py-1.5 text-sm"
            href={`${getApiBase()}${gstExportUrl({ month })}`}
          >
            Download XLSX
          </a>
        )}
        {itcEnabled && (
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm"
            disabled={busy}
            onClick={() => void discoverItc({ limit: 100 }).then(() => load())}
          >
            Discover ITC
          </button>
        )}
      </div>

      {err && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{err}</div>}

      {gstEnabled && (
        <>
          <div className="flex flex-wrap gap-2 border-b pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`rounded px-3 py-1 text-sm ${tab === t.id ? "bg-neutral-900 text-white" : "border"}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <section className="space-y-4">
              {!reportingEnabled && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
                  Reports require <code>ACCOUNTING_GST_REPORTING_ENABLED=1</code>. Ledger still available.
                </div>
              )}
              {reportingEnabled && overview && (
                <>
                  <p className="text-xs text-amber-800">{String(overview.disclaimer ?? "")}</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Output CGST", outwardSupplies?.outputCgstInPaise],
                      ["Output SGST", outwardSupplies?.outputSgstInPaise],
                      ["Output IGST", outwardSupplies?.outputIgstInPaise],
                      ["Total Output", outwardSupplies?.totalOutputGstInPaise],
                      ["Input recognized", inputTax?.recognizedTotalInPaise],
                      ["ITC Eligible", inputTax?.eligibleItcInPaise],
                      ["ITC Unverified", inputTax?.unverifiedItcInPaise],
                      ["ITC Blocked", inputTax?.blockedItcInPaise],
                      ["ITC Data Gap", inputTax?.dataGapItcInPaise],
                      ["Gateway provisional", inputTax?.gatewayProvisionalInPaise],
                      ["ESTIMATED NET GST", net?.estimatedNetGstPositionInPaise]
                    ].map(([label, val]) => (
                      <div key={String(label)} className="rounded border p-3 text-sm">
                        <div className="text-neutral-500">{String(label)}</div>
                        <div className="font-medium">{formatInrPaise(Number(val ?? 0))}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-neutral-500">{String(net?.note ?? "")}</p>
                  {integrity && (
                    <div className="rounded border p-3 text-sm">
                      Integrity: <strong>{String(integrity.status)}</strong>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {tab === "outward" && reportingEnabled && (
            <SimpleTable
              title="Outward supplies"
              rows={(outward?.rows as Array<Record<string, unknown>>) ?? []}
              cols={[
                ["orderNumber", "Order"],
                ["entryDate", "Date"],
                ["classification", "Class"],
                ["supplyType", "Supply"],
                ["placeOfSupplyCode", "POS"],
                ["taxableValueInPaise", "Taxable"],
                ["cgstInPaise", "CGST"],
                ["sgstInPaise", "SGST"],
                ["igstInPaise", "IGST"]
              ]}
              moneyKeys={new Set(["taxableValueInPaise", "cgstInPaise", "sgstInPaise", "igstInPaise"])}
            />
          )}

          {tab === "b2b" && reportingEnabled && (
            <div className="space-y-2">
              <p className="text-sm text-neutral-600">{String(b2b?.note ?? b2b?.policy ?? "")}</p>
              <SimpleTable
                title="B2B"
                rows={(b2b?.rows as Array<Record<string, unknown>>) ?? []}
                cols={[
                  ["gstin", "GSTIN"],
                  ["invoiceReference", "Invoice"],
                  ["invoiceDate", "Date"],
                  ["placeOfSupply", "POS"],
                  ["taxableValueInPaise", "Taxable"],
                  ["cgstInPaise", "CGST"],
                  ["sgstInPaise", "SGST"],
                  ["igstInPaise", "IGST"]
                ]}
                moneyKeys={new Set(["taxableValueInPaise", "cgstInPaise", "sgstInPaise", "igstInPaise"])}
              />
            </div>
          )}

          {tab === "b2c" && reportingEnabled && (
            <div className="space-y-2">
              <p className="text-sm">{String(b2c?.label ?? "")} — {String(b2c?.note ?? "")}</p>
              <SimpleTable
                title="B2C aggregates"
                rows={(b2c?.aggregates as Array<Record<string, unknown>>) ?? []}
                cols={[
                  ["placeOfSupplyCode", "POS"],
                  ["supplyType", "Supply"],
                  ["gstRate", "Rate"],
                  ["taxableValueInPaise", "Taxable"],
                  ["cgstInPaise", "CGST"],
                  ["sgstInPaise", "SGST"],
                  ["igstInPaise", "IGST"],
                  ["transactionCount", "Txns"]
                ]}
                moneyKeys={new Set(["taxableValueInPaise", "cgstInPaise", "sgstInPaise", "igstInPaise"])}
              />
            </div>
          )}

          {tab === "credit" && reportingEnabled && (
            <div className="space-y-2">
              <p className="text-sm">Partial refunds: {String(credit?.partialRefundPolicy ?? "")}</p>
              <SimpleTable
                title="Full refund reversals"
                rows={(credit?.fullRefunds as Array<Record<string, unknown>>) ?? []}
                cols={[
                  ["orderNumber", "Order"],
                  ["entryDate", "Date"],
                  ["cgstInPaise", "CGST"],
                  ["sgstInPaise", "SGST"],
                  ["igstInPaise", "IGST"]
                ]}
                moneyKeys={new Set(["cgstInPaise", "sgstInPaise", "igstInPaise"])}
              />
            </div>
          )}

          {tab === "hsn" && reportingEnabled && (
            <div className="space-y-4">
              <SimpleTable
                title="HSN summary"
                rows={(hsn?.rows as Array<Record<string, unknown>>) ?? []}
                cols={[
                  ["hsnSac", "HSN"],
                  ["hsnSource", "Source"],
                  ["gstRate", "Rate"],
                  ["taxableValueInPaise", "Taxable"],
                  ["cgstInPaise", "CGST"],
                  ["sgstInPaise", "SGST"],
                  ["igstInPaise", "IGST"],
                  ["warning", "Warning"]
                ]}
                moneyKeys={new Set(["taxableValueInPaise", "cgstInPaise", "sgstInPaise", "igstInPaise"])}
              />
              <SimpleTable
                title="Rate summary"
                rows={(rates?.rows as Array<Record<string, unknown>>) ?? []}
                cols={[
                  ["rateLabel", "Rate"],
                  ["taxableValueInPaise", "Taxable"],
                  ["cgstInPaise", "CGST"],
                  ["sgstInPaise", "SGST"],
                  ["igstInPaise", "IGST"],
                  ["refundTaxInPaise", "Refund"],
                  ["netTaxInPaise", "Net"]
                ]}
                moneyKeys={new Set([
                  "taxableValueInPaise",
                  "cgstInPaise",
                  "sgstInPaise",
                  "igstInPaise",
                  "refundTaxInPaise",
                  "netTaxInPaise"
                ])}
              />
            </div>
          )}

          {tab === "itc" && (
            <section className="space-y-3">
              {!itcEnabled && (
                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">
                  Requires <code>ACCOUNTING_ITC_VERIFICATION_ENABLED=1</code>.
                </div>
              )}
              {itcSummary && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    ["Recognized", itcSummary.recognizedInputGst.totalGstInPaise],
                    ["Eligible", itcSummary.eligibleInputGst.totalGstInPaise],
                    ["Unverified", itcSummary.unverifiedInputGst.totalGstInPaise],
                    ["Blocked", itcSummary.blockedInputGst.totalGstInPaise],
                    ["Data gaps", itcSummary.dataGapInputGst.totalGstInPaise],
                    ["Gateway provisional", itcSummary.gatewayProvisionalGst.totalGstInPaise]
                  ].map(([l, v]) => (
                    <div key={String(l)} className="rounded border p-3 text-sm">
                      <div className="text-neutral-500">{l}</div>
                      <div className="font-medium">{formatInrPaise(Number(v))}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto rounded border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-2 py-2">Source</th>
                      <th className="px-2 py-2">Supplier</th>
                      <th className="px-2 py-2">Total</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itcRows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-2 py-2">{r.sourceType}</td>
                        <td className="px-2 py-2">{r.supplierName ?? "—"}</td>
                        <td className="px-2 py-2">{formatInrPaise(r.totalGstInPaise)}</td>
                        <td className="px-2 py-2">{r.status}</td>
                        <td className="px-2 py-2 space-x-1">
                          <button type="button" className="underline" onClick={() => void fetchItcEvidence(r.id).then(setSelected)}>
                            Detail
                          </button>
                          <button type="button" className="underline" onClick={() => void act("verify", r.id)}>
                            Verify
                          </button>
                          <button type="button" className="underline" onClick={() => void act("block", r.id)}>
                            Block
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected && (
                <pre className="overflow-auto rounded border bg-neutral-50 p-3 text-xs">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              )}
            </section>
          )}

          {tab === "ledger" && (
            <SimpleTable
              title="GST Ledger (POSTED)"
              rows={(ledger?.accounts as Array<Record<string, unknown>>) ?? []}
              cols={[
                ["accountCode", "Code"],
                ["accountName", "Name"],
                ["openingBalanceInPaise", "Opening"],
                ["periodDebitInPaise", "Debit"],
                ["periodCreditInPaise", "Credit"],
                ["closingBalanceInPaise", "Closing"]
              ]}
              moneyKeys={new Set([
                "openingBalanceInPaise",
                "periodDebitInPaise",
                "periodCreditInPaise",
                "closingBalanceInPaise"
              ])}
            />
          )}

          {tab === "recon" && (
            <div className="space-y-4">
              {reportingEnabled && integrity && (
                <SimpleTable
                  title={`Report integrity — ${String(integrity.status)}`}
                  rows={(integrity.checks as Array<Record<string, unknown>>) ?? []}
                  cols={[
                    ["name", "Check"],
                    ["reportTotalInPaise", "Report"],
                    ["authorityTotalInPaise", "Authority"],
                    ["deltaInPaise", "Delta"],
                    ["pass", "Pass"]
                  ]}
                  moneyKeys={new Set(["reportTotalInPaise", "authorityTotalInPaise", "deltaInPaise"])}
                />
              )}
              {reconEnabled ? (
                <>
                  <ReconTable title="Sales recon" rows={salesRecon} />
                  <ReconTable title="Purchase recon" rows={purchaseRecon} />
                </>
              ) : (
                <p className="text-sm text-neutral-500">Source recon flag off.</p>
              )}
            </div>
          )}

          {tab === "gaps" && (
            <div className="space-y-4">
              {reportingEnabled && (
                <SimpleTable
                  title="Report data gaps"
                  rows={reportGaps}
                  cols={[
                    ["code", "Code"],
                    ["count", "Count"],
                    ["exposureInPaise", "Exposure"]
                  ]}
                  moneyKeys={new Set(["exposureInPaise"])}
                />
              )}
              {reconEnabled && <ReconTable title="Source data gaps" rows={gaps} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SimpleTable({
  title,
  rows,
  cols,
  moneyKeys
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  cols: Array<[string, string]>;
  moneyKeys: Set<string>;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{title}</h2>
      {!rows.length ? (
        <p className="text-sm text-neutral-500">No rows.</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                {cols.map(([, label]) => (
                  <th key={label} className="px-3 py-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {cols.map(([key]) => (
                    <td key={key} className="px-3 py-2">
                      {moneyKeys.has(key)
                        ? formatInrPaise(Number(r[key] ?? 0))
                        : String(r[key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReconTable({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{title}</h2>
      {!rows.length ? (
        <p className="text-sm text-neutral-500">No rows.</p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2">Scope</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Primary</th>
                <th className="px-3 py-2">Statuses</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{String(r.scope)}</td>
                  <td className="px-3 py-2">{String(r.reference ?? r.sourceId)}</td>
                  <td className="px-3 py-2">{String(r.primaryStatus)}</td>
                  <td className="px-3 py-2 text-xs">
                    {Array.isArray(r.statuses) ? r.statuses.join(", ") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
