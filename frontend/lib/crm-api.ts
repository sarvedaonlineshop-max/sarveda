import { getApiBase } from "@/lib/api";

export type CrmPagination = { page: number; limit: number; total: number; totalPages: number };
export type CrmUserSummary = { id: string; name?: string | null; email?: string | null };
export type CrmStage = { id: string; name: string; stageType: "OPEN" | "WON" | "LOST"; position: number; probabilityPercent: number; isActive: boolean };
export type CrmPipeline = { id: string; name: string; description?: string | null; isDefault: boolean; isActive: boolean; stages: CrmStage[] };
export type CrmLead = { id:string; leadNumber?:string|null; status:string; source:string; name:string; companyName?:string|null; email?:string|null; phone?:string|null; whatsappPhone?:string|null; designation?:string|null; city?:string|null; state?:string|null; country?:string|null; ownerUserId?:string|null; owner?:CrmUserSummary|null; estimatedValueInPaise?:number|null; currency?:string; expectedCloseDate?:string|null; interestSummary?:string|null; nextFollowUpAt?:string|null; lastContactedAt?:string|null; createdAt:string; updatedAt:string; enquiryThread?:{id:string; customerName?:string|null; customerEmail?:string|null; status?:string; source?:string}|null; activities?:Array<{id:string;type:string;subject:string;body?:string|null;occurredAt:string}>; tasks?:Array<{id:string;title:string;status:string;priority:string;dueAt?:string|null}>; convertedAccount?:{id:string;accountNumber?:string|null;name:string}|null; convertedContact?:{id:string;contactNumber?:string|null;displayName:string}|null; convertedDeal?:{id:string;dealNumber?:string|null;name:string;status:string}|null };
export type CrmDeal = { id:string; dealNumber?:string|null; name:string; status:string; amountInPaise:number; currency:string; stageId:string; pipelineId:string; expectedCloseDate?:string|null; owner?:CrmUserSummary|null; account?:{id:string;name:string}|null; contact?:{id:string;displayName:string}|null; tasks?:Array<{id:string;title:string;dueAt?:string|null;status:string}> };
export type CrmQuoteAddress = { fullName?:string; phone?:string|null; line1?:string; line2?:string|null; city?:string; state?:string; postalCode?:string; country?:string };
export type CrmQuoteRevision = { id:string; revision:number; action:string; note?:string|null; actorEmail?:string|null; actorName?:string|null; createdAt:string };
export type CrmSalesQuote = { id:string; quoteNumber:string; status:string; grandTotalInPaise:number; subtotalInPaise?:number; discountInPaise?:number; shippingInPaise?:number; packingInPaise?:number; taxInPaise?:number; currency?:string; approvalStatus?:string; approvalNote?:string|null; decidedByEmail?:string|null; enquiryThreadId?:string|null; customerName?:string; convertedOrderNumber?:string|null; ownerName?:string|null; approvedByName?:string|null; billingAddress?:CrmQuoteAddress|null; shippingAddress?:CrmQuoteAddress|null; revisions?:CrmQuoteRevision[]; items?:Array<{id:string; productName:string; sku?:string|null; quantity:number; unitPriceInPaise:number; discountPercent?:number; productId?:string|null; variantId?:string|null}> };
export type CrmChatPipeline = { id:string; crmPipeline:string; crmCategory:string|null; crmCategories?:string[]; customerName?:string; customerEmail?:string; customerPhone?:string|null; waPhone?:string|null; crmLocation?:string|null; orderNumber?:string|null; source?:string; crmOwnerAssigned?:boolean; crmOwner?:{id:string; name?:string|null; email?:string|null}|null; crmCollaborators?:Array<{id:string; name?:string|null; email?:string|null}>; crmNotes:Array<{id:string; body:string; kind?:string; createdAt:string; author?:{id:string; name?:string|null}|null}> };
export type CrmOrderDesk = {
  order: null | {
    id: string;
    orderNumber: string;
    status: string;
    currency: string;
    grandTotalInPaise: number;
    items: Array<{ name: string; sku: string; qty: number }>;
    shippingMethod: string;
    shippingZone: string | null;
    courier: string | null;
    awb: string | null;
    trackingUrl: string | null;
    step: "AWAITING_DISPATCH" | "PACKING" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED";
    currentLabel: string;
    events: Array<{ id: string; label: string; at: string | null; detail: string | null; state: "done" | "current" | "upcoming" }>;
    deliveredAt: string | null;
    rto: boolean;
    rtoAt: string | null;
    shippingError: string | null;
    dispatchApproved: boolean;
    collection: string;
  };
  returnCase: null | { caseNumber: string; stageLabel: string; reason: string | null; comment: string | null; assignee: string };
  feedback: null | { id: string; status: string; scheduledFor: string; sentAt: string | null; rating: number | null; response: string | null; consent: boolean };
  issues: Array<{ id: string; kind: string; summary: string; sku: string | null; productName: string | null; supplier: string | null; ownerEmail: string | null; correctiveAction: string | null; status: string; orderNumber: string | null }>;
};
export type CrmBoardRow = { id:string; customerName:string; phone?:string|null; crmPipeline:string; createdAt:string; owner?:{id:string; name?:string|null; email?:string|null}|null };
export type CrmPipelineDesk = { seeAll:boolean; byStatus:Record<string,number>; followUps:Array<{id:string; notes:string; dueAt:string; thread:{id:string; customerName:string; customerPhone?:string|null; crmPipeline:string; crmOwner?:{name?:string|null}|null}}>; rows:CrmBoardRow[]; owners:Array<{id:string; name?:string|null; email:string}> };
export type CrmCatalogHit = { variantId:string; productId:string; itemName:string; combination:string; sku:string; hsnCode?:string|null; taxClass?:string|null; rateInPaise:number; prices?:{INR:number;USD:number;AED:number} };
export type QuoteChargeSuggestion = { currency:"INR"|"USD"|"AED"; shippingMinor:number; packingMinor:number; note:string; packingNote:string };
export type CrmLeadPaymentView = {
  id: string;
  quoteNumber: string | null;
  orderNumber: string | null;
  method: "PREPAID" | "PARTIAL" | "COD" | "CREDIT";
  currency: string;
  totalInPaise: number;
  receivedInPaise: number;
  balanceInPaise: number;
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
  dueAt: string | null;
  paymentLinkUrl: string | null;
  finance: boolean;
  receipts: Array<{
    id: string;
    amountInPaise: number;
    channel: string;
    status: string;
    reference: string | null;
    note: string | null;
    recordedByEmail: string | null;
    verifiedByEmail: string | null;
    verifiedAt: string | null;
    createdAt: string;
    countsAsReceived: boolean;
  }>;
};

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
 chatPipeline:(threadId:string)=>crmFetch<CrmChatPipeline>(`/api/admin/crm/chat-pipeline/${threadId}`),
 setChatPipeline:(threadId:string,status:string)=>crmFetch<CrmChatPipeline>(`/api/admin/crm/chat-pipeline/${threadId}`,{method:"PATCH",body:JSON.stringify({status})}),
 setChatCategory:(threadId:string,category:string|null)=>crmFetch<CrmChatPipeline>(`/api/admin/crm/chat-pipeline/${threadId}/category`,{method:"PATCH",body:JSON.stringify({category})}),
 setChatCategories:(threadId:string,categories:string[])=>crmFetch<CrmChatPipeline>(`/api/admin/crm/chat-pipeline/${threadId}/category`,{method:"PATCH",body:JSON.stringify({categories})}),
 setChatOwner:(threadId:string,ownerUserId:string|null)=>crmFetch<CrmChatPipeline>(`/api/admin/crm/chat-pipeline/${threadId}/owner`,{method:"PATCH",body:JSON.stringify({ownerUserId})}),
 setChatCustomer:(threadId:string,body:{customerName:string; customerEmail?:string|null; customerPhone?:string|null; crmLocation?:string|null})=>crmFetch<CrmChatPipeline>(`/api/admin/crm/chat-pipeline/${threadId}/customer`,{method:"PATCH",body:JSON.stringify(body)}),
 setChatCollaborators:(threadId:string,userIds:string[])=>crmFetch<CrmChatPipeline>(`/api/admin/crm/chat-pipeline/${threadId}/collaborators`,{method:"PATCH",body:JSON.stringify({userIds})}),
 addChatNote:(threadId:string,body:string,kind?:"NOTE"|"CALL")=>crmFetch<CrmChatPipeline>(`/api/admin/crm/chat-pipeline/${threadId}/notes`,{method:"POST",body:JSON.stringify({body,kind})}),
 orderDesk:(threadId:string)=>crmFetch<CrmOrderDesk>(`/api/admin/crm/chat-pipeline/${threadId}/order-desk`),
 sendOrderFeedback:(threadId:string)=>crmFetch<CrmOrderDesk>(`/api/admin/crm/chat-pipeline/${threadId}/order-desk/feedback/send`,{method:"POST",body:"{}"}),
 recordOrderFeedback:(threadId:string,body:{rating:number;response?:string|null})=>crmFetch<CrmOrderDesk>(`/api/admin/crm/chat-pipeline/${threadId}/order-desk/feedback/response`,{method:"POST",body:JSON.stringify(body)}),
 resolveOrderFeedback:(threadId:string)=>crmFetch<CrmOrderDesk>(`/api/admin/crm/chat-pipeline/${threadId}/order-desk/feedback/resolve`,{method:"POST",body:"{}"}),
 setFeedbackConsent:(threadId:string,consent:boolean)=>crmFetch<CrmOrderDesk>(`/api/admin/crm/chat-pipeline/${threadId}/order-desk/feedback/consent`,{method:"PATCH",body:JSON.stringify({consent})}),
 updateOrderIssue:(threadId:string,issueId:string,body:{status?:string;correctiveAction?:string|null})=>crmFetch<CrmOrderDesk>(`/api/admin/crm/chat-pipeline/${threadId}/order-desk/issues/${issueId}`,{method:"PATCH",body:JSON.stringify(body)}),
 leadPayment:(threadId:string)=>crmFetch<CrmLeadPaymentView|null>(`/api/admin/crm/chat-pipeline/${threadId}/payment`),
 saveLeadPayment:(threadId:string,body:{method:string;dueDate:string|null})=>crmFetch<CrmLeadPaymentView>(`/api/admin/crm/chat-pipeline/${threadId}/payment`,{method:"PATCH",body:JSON.stringify(body)}),
 recordLeadReceipt:(threadId:string,body:{amountInPaise:number;channel:string;reference?:string|null;note?:string|null})=>crmFetch<CrmLeadPaymentView>(`/api/admin/crm/chat-pipeline/${threadId}/payment/receipts`,{method:"POST",body:JSON.stringify(body)}),
 verifyLeadReceipt:(threadId:string,receiptId:string)=>crmFetch<CrmLeadPaymentView>(`/api/admin/crm/chat-pipeline/${threadId}/payment/receipts/${receiptId}/verify`,{method:"POST",body:"{}"}),
 rejectLeadReceipt:(threadId:string,receiptId:string)=>crmFetch<CrmLeadPaymentView>(`/api/admin/crm/chat-pipeline/${threadId}/payment/receipts/${receiptId}/reject`,{method:"POST",body:"{}"}),
 shareLeadPaymentLink:(threadId:string)=>crmFetch<CrmLeadPaymentView>(`/api/admin/crm/chat-pipeline/${threadId}/payment/link`,{method:"POST",body:"{}"}),
 pipelineDesk:(p?:{status?:string; ownerId?:string; from?:string; to?:string})=>crmFetch<CrmPipelineDesk>(`/api/admin/crm/chat-pipeline${qs(p??{})}`),
 summary:()=>crmFetch<CrmSummary>("/api/admin/crm/summary"),
 report:()=>crmFetch<{totalLeads:number;convertedLeads:number;overdueCount:number;sources:Array<{source:string;leads:number;converted:number}>;overdueFollowUps:Array<{id:string;title:string;dueAt?:string|null;priority:string;lead?:{id:string;name:string;leadNumber?:string|null}|null;assignedTo?:CrmUserSummary|null}>}>("/api/admin/crm/report"),
 assignees:()=>crmFetch<CrmAssignee[]>("/api/admin/crm/assignees"),
 leads:(p:Record<string,any>)=>crmFetch<{items:CrmLead[];pagination:CrmPagination}>(`/api/admin/crm/leads${qs(p)}`),lead:(id:string)=>crmFetch<CrmLead>(`/api/admin/crm/leads/${id}`),createLead:(b:Record<string,unknown>)=>crmFetch<CrmLead>("/api/admin/crm/leads",{method:"POST",body:JSON.stringify(b)}),updateLead:(id:string,b:Record<string,unknown>)=>crmFetch<CrmLead>(`/api/admin/crm/leads/${id}`,{method:"PATCH",body:JSON.stringify(b)}),convertLead:(id:string,body?:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/leads/${id}/convert`,{method:"POST",body:JSON.stringify(body ?? {createAccount:true,createContact:true,createDeal:true})}),desk:(scope?:"mine"|"all")=>crmFetch<{canSeeAll:boolean;deals:Array<CrmDeal & {stage?:{id:string;name:string;stageType:string}|null;enquiryThreadId?:string|null;sourceLead?:{enquiryThread?:{id:string}|null}|null}>;leads:CrmLead[];followUps:Array<{id:string;notes:string;dueAt:string;thread:{id:string;customerName?:string|null;customerPhone?:string|null;customerEmail?:string|null}}>}>(`/api/admin/crm/desk${scope==="all"?"?scope=all":""}`),createSalesQuote:(b:Record<string,unknown>)=>crmFetch<CrmSalesQuote>("/api/admin/crm/sales-quotes",{method:"POST",body:JSON.stringify(b)}),updateSalesQuote:(id:string,b:Record<string,unknown>)=>crmFetch<CrmSalesQuote>(`/api/admin/crm/sales-quotes/${id}`,{method:"PUT",body:JSON.stringify(b)}),deleteSalesQuote:(id:string)=>crmFetch<{deleted:boolean}>(`/api/admin/crm/sales-quotes/${id}`,{method:"DELETE"}),shareSalesQuote:(id:string,threadId:string)=>crmFetch<{shared:boolean}>(`/api/admin/crm/sales-quotes/${id}/share`,{method:"POST",body:JSON.stringify({threadId})}),createQuoteOrder:(id:string,threadId:string)=>crmFetch<{orderNumber:string;mode:string;stockReduced:boolean}>(`/api/admin/crm/sales-quotes/${id}/order`,{method:"POST",body:JSON.stringify({threadId})}),submitSalesQuote:(id:string)=>crmFetch<CrmSalesQuote>(`/api/admin/crm/sales-quotes/${id}/submit`,{method:"POST",body:"{}"}),decideSalesQuote:(id:string,body:{decision:"APPROVED"|"REJECTED";note?:string})=>crmFetch<CrmSalesQuote>(`/api/admin/crm/sales-quotes/${id}/decision`,{method:"POST",body:JSON.stringify(body)}),salesQuote:(id:string)=>crmFetch<CrmSalesQuote>(`/api/admin/crm/sales-quotes/${id}`),quoteApprovals:(status:string)=>crmFetch<{pending:number;seeAll?:boolean;items:CrmSalesQuote[]}>(`/api/admin/crm/sales-quotes/approvals${qs({status})}`),quoteApprovalCount:()=>crmFetch<{pending:number}>("/api/admin/crm/sales-quotes/approvals/count"),suggestQuoteCharges:(body:{country:string;lines:Array<{variantId:string;quantity:number}>})=>crmFetch<QuoteChargeSuggestion>("/api/admin/crm/sales-quotes/charges",{method:"POST",body:JSON.stringify(body)}),searchQuoteCatalog:(q:string)=>crmFetch<CrmCatalogHit[]>(`/api/admin/crm/quote-catalog?q=${encodeURIComponent(q)}`),listSalesQuotes:(q:string,threadId?:string)=>crmFetch<CrmSalesQuote[]>(`/api/admin/crm/sales-quotes${qs({q,threadId})}`),
 deals:(p:Record<string,any>)=>crmFetch<{items:CrmDeal[];pagination:CrmPagination}>(`/api/admin/crm/deals${qs(p)}`),deal:(id:string)=>crmFetch<any>(`/api/admin/crm/deals/${id}`),createDeal:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/deals",{method:"POST",body:JSON.stringify(b)}),updateDeal:(id:string,b:Record<string,unknown>)=>crmFetch<CrmDeal>(`/api/admin/crm/deals/${id}`,{method:"PATCH",body:JSON.stringify(b)}),addDealProduct:(dealId:string,b:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/deals/${dealId}/products`,{method:"POST",body:JSON.stringify(b)}),deleteDealProduct:(id:string)=>crmFetch<any>(`/api/admin/crm/deal-products/${id}`,{method:"DELETE"}),linkOrder:(dealId:string,orderNumber:string)=>crmFetch<any>(`/api/admin/crm/deals/${dealId}/link-order`,{method:"POST",body:JSON.stringify({orderNumber})}),linkQuote:(dealId:string,quoteNumber:string)=>crmFetch<any>(`/api/admin/crm/deals/${dealId}/link-quotation`,{method:"POST",body:JSON.stringify({quoteNumber})}),
 accounts:(p:Record<string,any>)=>crmFetch<any>(`/api/admin/crm/accounts${qs(p)}`),account:(id:string)=>crmFetch<any>(`/api/admin/crm/accounts/${id}`),account360:(id:string)=>crmFetch<any>(`/api/admin/crm/accounts/${id}/360`),createAccount:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/accounts",{method:"POST",body:JSON.stringify(b)}),updateAccount:(id:string,b:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/accounts/${id}`,{method:"PATCH",body:JSON.stringify(b)}),
 contacts:(p:Record<string,any>)=>crmFetch<any>(`/api/admin/crm/contacts${qs(p)}`),contact:(id:string)=>crmFetch<any>(`/api/admin/crm/contacts/${id}`),contact360:(id:string)=>crmFetch<any>(`/api/admin/crm/contacts/${id}/360`),createContact:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/contacts",{method:"POST",body:JSON.stringify(b)}),updateContact:(id:string,b:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/contacts/${id}`,{method:"PATCH",body:JSON.stringify(b)}),
 tasks:(p:Record<string,any>)=>crmFetch<any>(`/api/admin/crm/tasks${qs(p)}`),createTask:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/tasks",{method:"POST",body:JSON.stringify(b)}),updateTask:(id:string,b:Record<string,unknown>)=>crmFetch<any>(`/api/admin/crm/tasks/${id}`,{method:"PATCH",body:JSON.stringify(b)}),
 activities:(p:Record<string,any>)=>crmFetch<any>(`/api/admin/crm/activities${qs(p)}`),createActivity:(b:Record<string,unknown>)=>crmFetch<any>("/api/admin/crm/activities",{method:"POST",body:JSON.stringify(b)})
};
