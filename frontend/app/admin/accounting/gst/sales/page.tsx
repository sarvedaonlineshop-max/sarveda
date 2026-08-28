"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchGstReportB2b,
  fetchGstReportB2c,
  fetchGstReportCreditNotes,
  fetchGstReportOutward,
  fetchGstReportRates,
  fetchGstStatus,
  formatInrPaise
} from "@/lib/accounting-api";
import {
  AccountingAlert,
  AccountingEmptyState,
  AccountingSectionCard,
  AccountingSectionHeader,
  AccountingStatusBadge,
  GstPageShell,
  GstSkeleton,
  GstTableWrap,
  GstUnavailableState,
  MonthFilter,
  currentGstMonth,
  formatPlaceOfSupply,
  gstStatusTone,
  gstTd,
  gstTh,
  humanizeClassification,
  humanizeSupplyType,
  moneyClass,
  salesDocumentRefs
} from "@/components/admin/accounting/gst/gst-ui";

type View = "outward" | "b2b" | "b2c" | "credit" | "rates";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "outward", label: "Outward sales" },
  { id: "b2b", label: "B2B" },
  { id: "b2c", label: "B2C" },
  { id: "credit", label: "Credit notes" },
  { id: "rates", label: "Rate summary" }
];

type Row = Record<string, unknown>;

export default function GstSalesPage() {
  const [month, setMonth] = useState(currentGstMonth);
  const [view, setView] = useState<View>("outward");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [reportingEnabled, setReportingEnabled] = useState(false);
  const [outward, setOutward] = useState<Row[]>([]);
  const [b2b, setB2b] = useState<Row[]>([]);
  const [b2bNote, setB2bNote] = useState<string | null>(null);
  const [b2c, setB2c] = useState<Row[]>([]);
  const [credit, setCredit] = useState<Row[]>([]);
  const [partialPolicy, setPartialPolicy] = useState<string | null>(null);
  const [rates, setRates] = useState<Row[]>([]);
  const [shippingNote, setShippingNote] = useState<string | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const st = await fetchGstStatus();
      setGstEnabled(st.gstEnabled);
      setReportingEnabled(Boolean(st.gstReportingEnabled));
      if (!st.gstEnabled || !st.gstReportingEnabled) return;

      const [o, b, c, cr, r] = await Promise.all([
        fetchGstReportOutward({ month }),
        fetchGstReportB2b({ month }),
        fetchGstReportB2c({ month }),
        fetchGstReportCreditNotes({ month }),
        fetchGstReportRates({ month })
      ]);
      setOutward((o.rows as Row[]) ?? []);
      const shipping = o.shipping as Record<string, unknown> | undefined;
      setShippingNote(
        shipping
          ? "Shipping GST is not calculated; shipping is recorded without inventing tax."
          : null
      );
      setB2b((b.rows as Row[]) ?? []);
      setB2bNote(
        "Buyer GSTIN is not captured on orders, so B2B reporting remains incomplete."
      );
      setB2c((c.aggregates as Row[]) ?? []);
      setCredit((cr.fullRefunds as Row[]) ?? []);
      setPartialPolicy(
        "Only full refunds reverse output GST. Partial-refund GST is not allocated."
      );
      setRates((r.rows as Row[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sales GST could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (view === "outward") return outward;
    if (view === "b2b") return b2b;
    if (view === "b2c") return b2c;
    if (view === "credit") return credit;
    return rates;
  }, [view, outward, b2b, b2c, credit, rates]);

  return (
    <GstPageShell
      title="Sales GST"
      subtitle="Outward GST on recorded sales and full-refund credit notes."
      actions={
        <div className="flex flex-wrap items-end gap-3">
          <MonthFilter month={month} onChange={setMonth} disabled={loading} />
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-md border border-[#ebe4db] bg-white px-3 py-1.5 text-xs font-semibold text-[#1c352a] hover:bg-[#faf5ec] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      }
    >
      {error ? <AccountingAlert tone="error">{error}</AccountingAlert> : null}
      {loading ? <GstSkeleton rows={8} /> : null}

      {!loading && !gstEnabled ? <GstUnavailableState /> : null}

      {!loading && gstEnabled && !reportingEnabled ? (
        <AccountingEmptyState
          title="Sales GST reports are not available"
          description="GST management reports are not enabled for this environment."
        />
      ) : null}

      {!loading && gstEnabled && reportingEnabled ? (
        <>
          {view === "b2b" ? (
            <AccountingAlert tone="warning" title="Buyer GSTIN unavailable">
              {b2bNote}
            </AccountingAlert>
          ) : null}

          {view === "credit" && partialPolicy ? (
            <AccountingAlert tone="warning" title="Partial-refund GST unavailable">
              {partialPolicy}
            </AccountingAlert>
          ) : null}

          {view === "outward" && shippingNote ? (
            <p className="text-xs text-[#8a7060]">{shippingNote}</p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {VIEWS.map((v) => {
              const active = view === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setView(v.id);
                    setDetail(null);
                  }}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${
                    active
                      ? "bg-[#1c352a] text-white"
                      : "border border-[#ebe4db] bg-white text-[#8a7060] hover:bg-[#faf5ec]"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          <AccountingSectionCard>
            <AccountingSectionHeader
              title={VIEWS.find((v) => v.id === view)?.label ?? "Sales GST"}
            />
            {rows.length === 0 ? (
              <AccountingEmptyState
                title={
                  view === "b2b"
                    ? "No B2B rows for this month"
                    : view === "credit"
                      ? "No full-refund credit notes"
                      : "No rows for this view"
                }
                description={
                  view === "b2b"
                    ? "This usually reflects the buyer GSTIN data gap, not missing sales."
                    : undefined
                }
              />
            ) : (
              <GstTableWrap>
                <table className="min-w-full">
                  <thead>
                    <tr>
                      {view === "outward" ? (
                        <>
                          <th className={gstTh()}>Document</th>
                          <th className={gstTh()}>Date</th>
                          <th className={gstTh()}>Classification</th>
                          <th className={gstTh()}>Supply</th>
                          <th className={gstTh()}>Place of supply</th>
                          <th className={gstTh(true)}>Taxable</th>
                          <th className={gstTh(true)}>CGST</th>
                          <th className={gstTh(true)}>SGST</th>
                          <th className={gstTh(true)}>IGST</th>
                          <th className={gstTh()}> </th>
                        </>
                      ) : null}
                      {view === "b2b" ? (
                        <>
                          <th className={gstTh()}>GSTIN</th>
                          <th className={gstTh()}>Document</th>
                          <th className={gstTh()}>Date</th>
                          <th className={gstTh()}>Place of supply</th>
                          <th className={gstTh(true)}>Taxable</th>
                          <th className={gstTh(true)}>CGST</th>
                          <th className={gstTh(true)}>SGST</th>
                          <th className={gstTh(true)}>IGST</th>
                          <th className={gstTh()}> </th>
                        </>
                      ) : null}
                      {view === "b2c" ? (
                        <>
                          <th className={gstTh()}>Place of supply</th>
                          <th className={gstTh()}>Supply</th>
                          <th className={gstTh()}>Rate</th>
                          <th className={gstTh(true)}>Taxable</th>
                          <th className={gstTh(true)}>CGST</th>
                          <th className={gstTh(true)}>SGST</th>
                          <th className={gstTh(true)}>IGST</th>
                          <th className={gstTh(true)}>Transactions</th>
                        </>
                      ) : null}
                      {view === "credit" ? (
                        <>
                          <th className={gstTh()}>Document</th>
                          <th className={gstTh()}>Date</th>
                          <th className={gstTh(true)}>CGST</th>
                          <th className={gstTh(true)}>SGST</th>
                          <th className={gstTh(true)}>IGST</th>
                          <th className={gstTh()}> </th>
                        </>
                      ) : null}
                      {view === "rates" ? (
                        <>
                          <th className={gstTh()}>Rate</th>
                          <th className={gstTh(true)}>Taxable</th>
                          <th className={gstTh(true)}>CGST</th>
                          <th className={gstTh(true)}>SGST</th>
                          <th className={gstTh(true)}>IGST</th>
                          <th className={gstTh(true)}>Refund tax</th>
                          <th className={gstTh(true)}>Net tax</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((r, i) => (
                      <tr
                        key={i}
                        className="border-t border-[#eee8e0] transition-colors hover:bg-[#faf5ec]/40"
                      >
                        {view === "outward" ? (
                          <>
                            <td className={gstTd()}>
                              <DocumentCell row={r} />
                            </td>
                            <td className={gstTd()}>
                              {r.entryDate ? String(r.entryDate).slice(0, 10) : "—"}
                            </td>
                            <td className={gstTd()}>
                              <AccountingStatusBadge
                                tone={gstStatusTone(String(r.classification))}
                              >
                                {humanizeClassification(String(r.classification))}
                              </AccountingStatusBadge>
                            </td>
                            <td className={gstTd()}>
                              {humanizeSupplyType(String(r.supplyType))}
                            </td>
                            <td className={gstTd()}>
                              {formatPlaceOfSupply(String(r.placeOfSupplyCode ?? ""))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.taxableValueInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.cgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.sgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.igstInPaise ?? 0))}
                            </td>
                            <td className={gstTd()}>
                              <button
                                type="button"
                                className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                                onClick={() => setDetail(r)}
                              >
                                Details
                              </button>
                            </td>
                          </>
                        ) : null}
                        {view === "b2b" ? (
                          <>
                            <td className={gstTd()}>{String(r.gstin ?? "—")}</td>
                            <td className={gstTd()}>
                              <DocumentCell row={r} />
                            </td>
                            <td className={gstTd()}>
                              {r.invoiceDate ? String(r.invoiceDate).slice(0, 10) : "—"}
                            </td>
                            <td className={gstTd()}>
                              {formatPlaceOfSupply(String(r.placeOfSupply ?? ""))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.taxableValueInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.cgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.sgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.igstInPaise ?? 0))}
                            </td>
                            <td className={gstTd()}>
                              <button
                                type="button"
                                className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                                onClick={() => setDetail(r)}
                              >
                                Details
                              </button>
                            </td>
                          </>
                        ) : null}
                        {view === "b2c" ? (
                          <>
                            <td className={gstTd()}>
                              {formatPlaceOfSupply(String(r.placeOfSupplyCode ?? ""))}
                            </td>
                            <td className={gstTd()}>
                              {humanizeSupplyType(String(r.supplyType))}
                            </td>
                            <td className={gstTd()}>{String(r.gstRate ?? "—")}%</td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.taxableValueInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.cgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.sgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.igstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} tabular-nums`}>
                              {String(r.transactionCount ?? "—")}
                            </td>
                          </>
                        ) : null}
                        {view === "credit" ? (
                          <>
                            <td className={gstTd()}>
                              <DocumentCell row={r} />
                            </td>
                            <td className={gstTd()}>
                              {r.entryDate ? String(r.entryDate).slice(0, 10) : "—"}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.cgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.sgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.igstInPaise ?? 0))}
                            </td>
                            <td className={gstTd()}>
                              <button
                                type="button"
                                className="text-xs font-semibold text-[#1c352a] underline-offset-2 hover:underline"
                                onClick={() => setDetail(r)}
                              >
                                Details
                              </button>
                            </td>
                          </>
                        ) : null}
                        {view === "rates" ? (
                          <>
                            <td className={gstTd()}>{String(r.rateLabel ?? "—")}</td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.taxableValueInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.cgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.sgstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.igstInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.refundTaxInPaise ?? 0))}
                            </td>
                            <td className={`${gstTd(true)} ${moneyClass()}`}>
                              {formatInrPaise(Number(r.netTaxInPaise ?? 0))}
                            </td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GstTableWrap>
            )}
          </AccountingSectionCard>

          {detail ? (
            <AccountingSectionCard>
              <AccountingSectionHeader
                title="Document details"
                action={
                  <button
                    type="button"
                    className="text-xs text-[#8a7060] underline-offset-2 hover:underline"
                    onClick={() => setDetail(null)}
                  >
                    Close
                  </button>
                }
              />
              <dl className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <DetailFact label="Primary reference">
                  {salesDocumentRefs(detail).primary}
                </DetailFact>
                {salesDocumentRefs(detail).secondary ? (
                  <DetailFact label="Order / source reference">
                    {salesDocumentRefs(detail).secondary}
                  </DetailFact>
                ) : null}
                {detail.orderNumber ? (
                  <DetailFact label="Order number">{String(detail.orderNumber)}</DetailFact>
                ) : null}
                {detail.journalEntryNumber ? (
                  <DetailFact label="Journal entry">
                    {String(detail.journalEntryNumber)}
                  </DetailFact>
                ) : null}
                {detail.invoiceReference ? (
                  <DetailFact label="Invoice reference">
                    {String(detail.invoiceReference)}
                  </DetailFact>
                ) : null}
                <DetailFact label="Date">
                  {String(detail.entryDate ?? detail.invoiceDate ?? "—").slice(0, 10)}
                </DetailFact>
                <DetailFact label="Taxable" money>
                  {formatInrPaise(Number(detail.taxableValueInPaise ?? 0))}
                </DetailFact>
                <DetailFact label="CGST" money>
                  {formatInrPaise(Number(detail.cgstInPaise ?? 0))}
                </DetailFact>
                <DetailFact label="SGST" money>
                  {formatInrPaise(Number(detail.sgstInPaise ?? 0))}
                </DetailFact>
                <DetailFact label="IGST" money>
                  {formatInrPaise(Number(detail.igstInPaise ?? 0))}
                </DetailFact>
              </dl>
            </AccountingSectionCard>
          ) : null}
        </>
      ) : null}
    </GstPageShell>
  );
}

function DocumentCell({ row }: { row: Row }) {
  const refs = salesDocumentRefs(row);
  return (
    <div className="min-w-0">
      <div className="font-medium text-[#2c2420]">{refs.primary}</div>
      {refs.secondary ? (
        <div className="mt-0.5 truncate text-[11px] text-[#8a7060]" title={refs.secondary}>
          {refs.secondary}
        </div>
      ) : null}
    </div>
  );
}

function DetailFact({
  label,
  children,
  money
}: {
  label: string;
  children: React.ReactNode;
  money?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[#ebe4db] bg-[#faf5ec] px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[#8a7060]">{label}</dt>
      <dd className={`mt-1 text-sm ${money ? moneyClass() : "font-semibold text-[#2c2420]"}`}>
        {children}
      </dd>
    </div>
  );
}
