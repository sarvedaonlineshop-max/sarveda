"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { crmApi, type CrmAssignee } from "@/lib/crm-api";
import { CrmTabs, DateText, Money, SectionTitle, StatusPill, crmButton, crmCard, crmGhostButton, crmInput } from "@/components/admin/crm/CrmPrimitives";
import { useAdminPageHeader } from "@/components/admin/useAdminPageHeader";

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<any>(null);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [stageId, setStageId] = useState("");
  const [productName, setProductName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [stages, setStages] = useState<Array<{ id: string; name: string }>>([]);

  const load = () => crmApi.deal(id).then((d) => {
    setDeal(d);
    setAmount(d.amountInPaise ? String(d.amountInPaise / 100) : "");
    setNotes(d.notes ?? "");
    setOwnerUserId(d.ownerUserId ?? d.owner?.id ?? "");
    setStageId(d.stageId ?? "");
  }).catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
    crmApi.assignees().then(setAssignees).catch(() => undefined);
    crmApi.pipelines().then((pipelines) => {
      const current = pipelines.find((p) => p.stages.some((s) => s.id === stageId)) || pipelines.find((p) => p.isDefault) || pipelines[0];
      if (current) setStages(current.stages.filter((s) => s.isActive));
    }).catch(() => undefined);
  }, [id]);

  useAdminPageHeader(
    () => ({
      title: deal?.name || "Deal",
      icon: "◇",
      subtitle: <>{deal?.dealNumber || "CRM deal"}</>,
      actions: (
        <Link href="/admin/crm/deals" style={{ ...crmGhostButton, display: "inline-flex", textDecoration: "none", alignItems: "center" }}>
          ← Deals
        </Link>
      )
    }),
    [deal]
  );

  if (error) return <div style={{ ...crmCard, padding: 16, color: "#a94442" }}>{error}</div>;
  if (!deal) return <div style={{ padding: 40, textAlign: "center" }}>Loading deal…</div>;

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await crmApi.updateDeal(deal.id, {
        amountInPaise: amount.trim() ? Math.round(Number(amount) * 100) : 0,
        notes: notes.trim() || null,
        ownerUserId: ownerUserId || null,
        ...(stageId && stageId !== deal.stageId ? { stageId } : {})
      });
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const addProduct = async () => {
    if (!productName.trim()) return;
    setBusy(true);
    try {
      await crmApi.addDealProduct(deal.id, {
        productName: productName.trim(),
        quantity: Math.max(1, Number(qty) || 1),
        unitPriceInPaise: Math.round((Number(price) || 0) * 100)
      });
      setProductName("");
      setPrice("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not add the product");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <CrmTabs active="Deals" />
      <div style={{ ...crmCard, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>{deal.name}</h2>
            <div style={{ marginTop: 6 }}><StatusPill value={deal.status} /></div>
          </div>
          <strong style={{ fontSize: 22 }}><Money paise={deal.amountInPaise} currency={deal.currency} /></strong>
        </div>
        <p style={{ fontSize: 12, color: "var(--admin-text-muted)", marginTop: 10 }}>
          Marking a deal won records it in CRM. It does not place a shop order.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginTop: 12 }}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Value ₹" type="number" min="0" style={crmInput} />
          <select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} style={crmInput}>
            <option value="">Unassigned</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
          </select>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} style={crmInput}>
            {(stages.length ? stages : [{ id: deal.stageId, name: deal.stage?.name || "Current stage" }]).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" style={crmInput} />
        </div>
        <button disabled={busy} onClick={() => void save()} style={{ ...crmButton, marginTop: 10 }}>Save deal</button>
      </div>

      <div style={{ ...crmCard, padding: 16 }}>
        <SectionTitle>Products</SectionTitle>
        {(deal.products || []).map((p: any) => (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--admin-card-border)" }}>
            <span>{p.productName} × {p.quantity}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Money paise={p.lineTotalInPaise} />
              <button disabled={busy} style={crmGhostButton} onClick={() => { setBusy(true); crmApi.deleteDealProduct(p.id).then(load).finally(() => setBusy(false)); }}>Remove</button>
            </span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Product name" style={{ ...crmInput, flex: "1 1 180px" }} />
          <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" style={{ ...crmInput, width: 80 }} />
          <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" placeholder="Price ₹" style={{ ...crmInput, width: 120 }} />
          <button disabled={busy || !productName.trim()} onClick={() => void addProduct()} style={crmButton}>Add</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }} className="crm-deal-links">
        <div style={{ ...crmCard, padding: 16 }}>
          <SectionTitle>Shop order</SectionTitle>
          {deal.order ? <div>{deal.order.orderNumber} · {deal.order.status}</div> : <div style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>No order linked.</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Order number" style={{ ...crmInput, flex: 1 }} />
            <button disabled={busy || !orderNumber.trim()} style={crmButton} onClick={() => { setBusy(true); crmApi.linkOrder(deal.id, orderNumber.trim()).then(load).catch((e: Error) => setError(e.message)).finally(() => setBusy(false)); }}>Link</button>
          </div>
        </div>
        <div style={{ ...crmCard, padding: 16 }}>
          <SectionTitle>Quotation</SectionTitle>
          {deal.quotation ? <div>{deal.quotation.quoteNumber} · <DateText value={deal.quotation.createdAt} /></div> : <div style={{ fontSize: 12, color: "var(--admin-text-muted)" }}>No quote linked.</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} placeholder="Quote number" style={{ ...crmInput, flex: 1 }} />
            <button disabled={busy || !quoteNumber.trim()} style={crmButton} onClick={() => { setBusy(true); crmApi.linkQuote(deal.id, quoteNumber.trim()).then(load).catch((e: Error) => setError(e.message)).finally(() => setBusy(false)); }}>Link</button>
          </div>
        </div>
      </div>
      <style jsx global>{`@media(max-width:800px){.crm-deal-links{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
