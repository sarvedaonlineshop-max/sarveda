import { getApiBase } from "@/lib/api";

export type CrmPagination = { page: number; limit: number; total: number; totalPages: number };
export type CrmUserSummary = { id: string; name?: string | null; email?: string | null };
export type CrmStage = { id: string; name: string; stageType: "OPEN" | "WON" | "LOST"; position: number; probabilityPercent: number; isActive: boolean };
export type CrmPipeline = { id: string; name: string; description?: string | null; isDefault: boolean; isActive: boolean; stages: CrmStage[] };
export type CrmLead = {
  id: string; leadNumber?: string | null; status: string; source: string; name: string; companyName?: string | null;
  email?: string | null; phone?: string | null; whatsappPhone?: string | null; designation?: string | null; city?: string | null;
  state?: string | null; country?: string | null; ownerUserId?: string | null; owner?: CrmUserSummary | null;
  estimatedValueInPaise?: number | null; currency?: string; expectedCloseDate?: string | null; interestSummary?: string | null;
  nextFollowUpAt?: string | null; lastContactedAt?: string | null; createdAt: string; updatedAt: string;
  activities?: Array<{ id: string; type: string; subject: string; body?: string | null; occurredAt: string }>;
  tasks?: Array<{ id: string; title: string; status: string; priority: string; dueAt?: string | null }>;
  convertedAccount?: { id: string; accountNumber?: string | null; name: string } | null;
  convertedContact?: { id: string; contactNumber?: string | null; displayName: string } | null;
  convertedDeal?: { id: string; dealNumber?: string | null; name: string; status: string } | null;
};
export type CrmDeal = { id: string; dealNumber?: string | null; name: string; status: string; amountInPaise: number; currency: string; stageId: string; pipelineId: string; expectedCloseDate?: string | null; owner?: CrmUserSummary | null; account?: { id: string; name: string } | null; contact?: { id: string; displayName: string } | null; tasks?: Array<{ id: string; title: string; dueAt?: string | null; status: string }> };

async function crmFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, { ...init, credentials: "include", headers: { Accept: "application/json", "Content-Type": "application/json", ...init?.headers } });
  let json: any = {};
  try { json = await res.json(); } catch {}
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed (${res.status})`);
  return json.data as T;
}

function qs(values: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); });
  const s = p.toString(); return s ? `?${s}` : "";
}

export const crmApi = {
  pipelines: () => crmFetch<CrmPipeline[]>("/api/admin/crm/pipelines"),
  leads: (params: Record<string, string | number | undefined>) => crmFetch<{items: CrmLead[]; pagination: CrmPagination}>(`/api/admin/crm/leads${qs(params)}`),
  lead: (id: string) => crmFetch<CrmLead>(`/api/admin/crm/leads/${id}`),
  createLead: (body: Record<string, unknown>) => crmFetch<CrmLead>("/api/admin/crm/leads", { method: "POST", body: JSON.stringify(body) }),
  updateLead: (id: string, body: Record<string, unknown>) => crmFetch<CrmLead>(`/api/admin/crm/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  convertLead: (id: string) => crmFetch<any>(`/api/admin/crm/leads/${id}/convert`, { method: "POST", body: JSON.stringify({ createAccount: true, createContact: true, createDeal: true }) }),
  deals: (params: Record<string, string | number | undefined>) => crmFetch<{items: CrmDeal[]; pagination: CrmPagination}>(`/api/admin/crm/deals${qs(params)}`),
  updateDeal: (id: string, body: Record<string, unknown>) => crmFetch<CrmDeal>(`/api/admin/crm/deals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  tasks: (params: Record<string, string | number | undefined>) => crmFetch<any>(`/api/admin/crm/tasks${qs(params)}`),
  activities: (params: Record<string, string | number | undefined>) => crmFetch<any>(`/api/admin/crm/activities${qs(params)}`)
};
