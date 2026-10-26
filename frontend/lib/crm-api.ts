import { getApiBase } from "@/lib/api";

export type CrmPagination = { page: number; limit: number; total: number; totalPages: number };
export type CrmUserSummary = { id: string; name?: string | null; email?: string | null };
export type CrmStage = { id: string; name: string; stageType: "OPEN" | "WON" | "LOST"; position: number; probabilityPercent: number; isActive: boolean };
export type CrmPipeline = { id: string; name: string; description?: string | null; isDefault: boolean; isActive: boolean; stages: CrmStage[] };
export type CrmLead = { id:string; leadNumber?:string|null; status:string; source:string; name:string; companyName?:string|null; email?:string|null; phone?:string|null; whatsappPhone?:string|null; designation?:string|null; city?:string|null; state?:string|null; country?:string|null; ownerUserId?:string|null; owner?:CrmUserSummary|null; estimatedValueInPaise?:number|null; currency?:string; expectedCloseDate?:string|null; interestSummary?:string|null; nextFollowUpAt?:string|null; lastContactedAt?:string|null; createdAt:string; updatedAt:string; enquiryThread?:{id:string; customerName?:string|null; customerEmail?:string|null; status?:string; source?:string}|null; activities?:Array<{id:string;type:string;subject:string;body?:string|null;occurredAt:string}>; tasks?:Array<{id:string;title:string;status:string;priority:string;dueAt?:string|null}>; convertedAccount?:{id:string;accountNumber?:string|null;name:string}|null; convertedContact?:{id:string;contactNumber?:string|null;displayName:string}|null; convertedDeal?:{id:string;dealNumber?:string|null;name:string;status:string}|null };
export type CrmDeal = { id:string; dealNumber?:string|null; name:string; status:string; amountInPaise:number; currency:string; stageId:string; pipelineId:string; expectedCloseDate?:string|null; owner?:CrmUserSummary|null; account?:{id:string;name:string}|null; contact?:{id:string;displayName:string}|null; tasks?:Array<{id:string;title:string;dueAt?:string|null;status:string}> };

async function crmFetch<T>(path:string,init?:RequestInit):Promise<T>{const res=await fetch(`${getApiBase()}${path}`,{...init,credentials:"include",headers:{Accept:"application/json","Content-Type":"application/json",...init?.headers}});let json:any={};try{json=await res.json()}catch{}if(!res.ok||json.success===false)throw new Error(json.error||`Request failed (${res.status})`);return json.data as T}
function qs(values:Record<string,string|number|boolean|undefined|null>){const p=new URLSearchParams();Object.entries(values).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=="")p.set(k,String(v))});const s=p.toString();return s?`?${s}`:""}
export type CrmAssignee = { id: string; name: string | null; email: string };
export type CrmSummary = {
  activeLeadCount: number;
  unassignedLeadCount: number;
  openDealCount: number;
  openPipelineInPaise: number;
  wonDealCount: number;
  wonInPaise: number;
  followUpOpenCount: number;
  followUpOverdueCount: number;
  stages: Array<{ id: string; name: string; count: number; amountInPaise: number; deals: Array<{ id: string; name: string; amountInPaise: number; currency: string; who: string }> }>;
};
export const crmApi={
 pipelines:()=>crmFetch<CrmPipeline[]>("/api/admin/crm/pipelines"),
 summary:()=>crmFetch<CrmSummary>("/api/admin/crm/summary"),
 report:()=>crmFetch<{totalLeads:number;convertedLeads:number;overdueCount:number;sources:Array<{source:string;leads:number;converted:number}>;overdueFollowUps:Array<{id:string;title:string;dueAt?:string|null;priority:string;lead?:{id:string;name:string;leadNumber?:string|null}|null;assignedTo?:CrmUserSummary|null}>}>("/api/admin/crm/report"),
 assignees:()=>crmFetch<CrmAssignee[]>("/api/admin/crm/assignees"),
 leads:(p:Record<string,any>)=>crmFetch<{items:CrmLead[];pagination:CrmPagination}>(`/api/admin/crm/leads${qs(p)}`),lead:(id:string)=>crmFetch<CrmLead>(`/api/admin/crm/leads/${id}`),createLead:(b:Record<string,unknown>)=>crmFetch<CrmLead>("/api/admin/crm/leads",{method:"POST",body:JSON.stringify(b)}),updateLead:(id:string,b:Record<string,unknown>)=>crmFetch<CrmLead>(`/api/admin/crm/leads/${id}`,{method:"PATCH",body:JSON.stringify(b)}),convertLead:(id:string)=>crmFetch<any>(`/api/admin/crm/leads/${id}/convert`,{method:"POST",body:JSON.stringify({createAccount:true,createContact:true,createDeal:true})}),
 deals:(p:Record<string,any>)=>crmFetch<{items:CrmDeal[];pagination:CrmPagination}>(`/api/admin/crm/deals${qs(p)}`),deal:(id:string)=>crmFetch<any>(`/api/admin/crm/deals/${id}`),createDeal:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/deals",{method:"POST",body:JSON.stringify(b)}),updateDeal:(id:string,b:Record<string,unknown>)=>crmFetch<CrmDeal>(`/api/admin/crm/deals/${id}`,{method:"PATCH",body:JSON.stringify(b)}),addDealProduct:(dealId:string,b:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/deals/${dealId}/products`,{method:"POST",body:JSON.stringify(b)}),deleteDealProduct:(id:string)=>crmFetch<any>(`/api/admin/crm/deal-products/${id}`,{method:"DELETE"}),linkOrder:(dealId:string,orderNumber:string)=>crmFetch<any>(`/api/admin/crm/deals/${dealId}/link-order`,{method:"POST",body:JSON.stringify({orderNumber})}),linkQuote:(dealId:string,quoteNumber:string)=>crmFetch<any>(`/api/admin/crm/deals/${dealId}/link-quotation`,{method:"POST",body:JSON.stringify({quoteNumber})}),
 accounts:(p:Record<string,any>)=>crmFetch<any>(`/api/admin/crm/accounts${qs(p)}`),account:(id:string)=>crmFetch<any>(`/api/admin/crm/accounts/${id}`),account360:(id:string)=>crmFetch<any>(`/api/admin/crm/accounts/${id}/360`),createAccount:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/accounts",{method:"POST",body:JSON.stringify(b)}),updateAccount:(id:string,b:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/accounts/${id}`,{method:"PATCH",body:JSON.stringify(b)}),
 contacts:(p:Record<string,any>)=>crmFetch<any>(`/api/admin/crm/contacts${qs(p)}`),contact:(id:string)=>crmFetch<any>(`/api/admin/crm/contacts/${id}`),contact360:(id:string)=>crmFetch<any>(`/api/admin/crm/contacts/${id}/360`),createContact:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/contacts",{method:"POST",body:JSON.stringify(b)}),updateContact:(id:string,b:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/contacts/${id}`,{method:"PATCH",body:JSON.stringify(b)}),
 tasks:(p:Record<string,any>)=>crmFetch<any>(`/api/admin/crm/tasks${qs(p)}`),createTask:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/tasks",{method:"POST",body:JSON.stringify(b)}),updateTask:(id:string,b:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/tasks/${id}`,{method:"PATCH",body:JSON.stringify(b)}),
 activities:(p:Record<string,any>)=>crmFetch<any>(`/api/admin/crm/activities${qs(p)}`),createActivity:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/activities",{method:"POST",body:JSON.stringify(b)})
};
