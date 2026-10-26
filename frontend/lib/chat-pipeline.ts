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

/** Colours from Arjun's spec. */
export const CHAT_PIPELINE_COLORS: Record<ChatPipelineStatus, { bg: string; text: string }> = {
  NEW: { bg: "#2563eb", text: "#ffffff" },
  ONGOING: { bg: "#14b8a6", text: "#ffffff" },
  QUOTATION_SENT: { bg: "#f97316", text: "#ffffff" },
  FOLLOWUP: { bg: "#eab308", text: "#1c352a" },
  COMPLETED: { bg: "#16a34a", text: "#ffffff" },
  NOT_INTERESTED: { bg: "#f9a8d4", text: "#9d174d" },
  UNQUALIFIED: { bg: "#9ca3af", text: "#ffffff" }
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

export function chatCategoryLabel(value: string | null | undefined): string {
  const row = CHAT_CATEGORIES.find(([id]) => id === value);
  return row?.[1] ?? value ?? "";
}

export function defaultFollowUpLocalValue(): string {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
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
