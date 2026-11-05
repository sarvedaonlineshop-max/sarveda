export const CHAT_PIPELINE_STATUSES = [
  "NEW",
  "ONGOING",
  "QUOTATION_SENT",
  "FOLLOWUP",
  "COMPLETED",
  "NOT_INTERESTED",
  "UNQUALIFIED"
] as const;

export type ChatPipelineStatus = (typeof CHAT_PIPELINE_STATUSES)[number];

export const CHAT_PIPELINE_LABELS: Record<ChatPipelineStatus, string> = {
  NEW: "New",
  ONGOING: "Ongoing",
  QUOTATION_SENT: "Quotation Sent",
  FOLLOWUP: "Follow-up",
  COMPLETED: "Completed",
  NOT_INTERESTED: "Not Interested",
  UNQUALIFIED: "Unqualified"
};

/** Solid colours for the chat-list strip and short label. */
export const CHAT_PIPELINE_COLORS: Record<ChatPipelineStatus, { bg: string; text: string }> = {
  NEW: { bg: "#2563eb", text: "#ffffff" },
  ONGOING: { bg: "#14b8a6", text: "#ffffff" },
  QUOTATION_SENT: { bg: "#f97316", text: "#ffffff" },
  FOLLOWUP: { bg: "#eab308", text: "#1c352a" },
  COMPLETED: { bg: "#16a34a", text: "#ffffff" },
  NOT_INTERESTED: { bg: "#f9a8d4", text: "#9d174d" },
  UNQUALIFIED: { bg: "#9ca3af", text: "#ffffff" }
};

/** Soft pills used in the Lead panel dropdown, matching the sample. */
export const CHAT_PIPELINE_PILLS: Record<ChatPipelineStatus, { bg: string; text: string }> = {
  NEW: { bg: "#dbeafe", text: "#2563eb" },
  ONGOING: { bg: "#ccfbf1", text: "#0f766e" },
  QUOTATION_SENT: { bg: "#fff1e6", text: "#f97316" },
  FOLLOWUP: { bg: "#fef3c7", text: "#a16207" },
  COMPLETED: { bg: "#dcfce7", text: "#15803d" },
  NOT_INTERESTED: { bg: "#fce7f3", text: "#9d174d" },
  UNQUALIFIED: { bg: "#f3f4f6", text: "#6b7280" }
};

export const CHAT_PIPELINE_MENU_LABELS: Record<ChatPipelineStatus, string> = {
  NEW: "New",
  ONGOING: "Ongoing",
  QUOTATION_SENT: "Quotation",
  FOLLOWUP: "Follow-up",
  COMPLETED: "Completed",
  NOT_INTERESTED: "Not Interested",
  UNQUALIFIED: "Unqualified"
};

export const CHAT_CATEGORIES = [
  ["PRODUCTS", "Products"],
  ["COURSES", "Courses"],
  ["DELIVERY", "Delivery"],
  ["PAYMENT", "Payment / Technical"],
  ["REFUND", "Return / Refund"],
  ["B2B", "B2B"],
  ["OTHERS", "Others"]
] as const;

export type ChatCategory = (typeof CHAT_CATEGORIES)[number][0];

export const CHAT_CATEGORY_COLORS: Record<ChatCategory, string> = {
  PRODUCTS: "#1d4e89",
  COURSES: "#7c3aed",
  DELIVERY: "#0f766e",
  PAYMENT: "#b45309",
  REFUND: "#be185d",
  B2B: "#365f8d",
  OTHERS: "#57534e"
};

const OWNER_PALETTE = ["#0f766e", "#1d4e89", "#7c3aed", "#b45309", "#be185d", "#365f8d", "#166534"];

export function ownerTagColor(seed: string | null | undefined): string {
  const value = (seed ?? "").trim() || "unassigned";
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return OWNER_PALETTE[hash % OWNER_PALETTE.length] ?? "#0f766e";
}

export function normalizeChatPipeline(status: string | null | undefined): ChatPipelineStatus {
  const raw = (status ?? "NEW").toUpperCase();
  if (raw === "CONTACTED") return "ONGOING";
  if (raw === "WON") return "COMPLETED";
  if (raw === "LOST") return "NOT_INTERESTED";
  if (raw === "FOLLOW_UP") return "FOLLOWUP";
  if ((CHAT_PIPELINE_STATUSES as readonly string[]).includes(raw)) {
    return raw as ChatPipelineStatus;
  }
  return "NEW";
}

export function chatPipelineLabel(status: string | null | undefined): string {
  return CHAT_PIPELINE_LABELS[normalizeChatPipeline(status)];
}

/** Short list labels from the CRM sample (QUOTE, ONGO, FU, NI, UNQ). */
export const CHAT_PIPELINE_SHORT: Record<ChatPipelineStatus, string> = {
  NEW: "NEW",
  ONGOING: "ONGO",
  QUOTATION_SENT: "QUOTE",
  FOLLOWUP: "FU",
  COMPLETED: "DONE",
  NOT_INTERESTED: "NI",
  UNQUALIFIED: "UNQ"
};

export function chatPipelineShort(status: string | null | undefined): string {
  return CHAT_PIPELINE_SHORT[normalizeChatPipeline(status)];
}

export function chatCategoryLabel(value: string | null | undefined): string {
  const row = CHAT_CATEGORIES.find(([id]) => id === value);
  return row?.[1] ?? value ?? "";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function defaultFollowUpLocalValue(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(10, 0, 0, 0);
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}T${pad2(next.getHours())}:${pad2(next.getMinutes())}`;
}

export function splitFollowUpLocal(value: string): { date: string; time: string } {
  const [date, time = "10:00"] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export function joinFollowUpLocal(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}`;
}

export function formatFollowUpDate(date: string): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

export function formatFollowUpTime(time: string): string {
  const [hourRaw, minuteRaw = "00"] = time.split(":");
  let hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return "10:00 AM";
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minuteRaw.padStart(2, "0")} ${suffix}`;
}

export function followUpLocalFromDate(value: string | Date): string {
  const when = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(when.getTime())) return defaultFollowUpLocalValue();
  return `${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())}T${pad2(when.getHours())}:${pad2(when.getMinutes())}`;
}

const BOT_AUTHOR = "Sarveda Assistant";

export function chatAdminSenderLabel(message: {
  authorType?: string | null;
  authorName?: string | null;
  adminUser?: { name?: string | null; email?: string | null } | null;
}): string | null {
  if ((message.authorType ?? "").toUpperCase() !== "ADMIN") return null;
  const name =
    message.adminUser?.name?.trim() ||
    message.authorName?.trim() ||
    message.adminUser?.email?.split("@")[0] ||
    "";
  if (!name || name === BOT_AUTHOR) return null;
  return name;
}

export function detectCountryLabel(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.startsWith("91")) return "India";
  if (digits.startsWith("1")) return "USA";
  if (digits.startsWith("44")) return "United Kingdom";
  if (digits.startsWith("971")) return "UAE";
  return null;
}
