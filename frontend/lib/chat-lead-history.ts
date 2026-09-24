import { ENQUIRY_SOURCE_LABELS, type EnquirySource } from "./enquiry-subjects";

export const CHAT_LEAD_BLUE = "#53bdeb";

export type ChatLeadStatus = "NEW" | "ONGOING" | "FOLLOW_UP" | "CLOSED";

export const LEAD_STATUS_LABELS: Record<ChatLeadStatus, string> = {
  NEW: "New",
  ONGOING: "Ongoing",
  FOLLOW_UP: "Follow-up",
  CLOSED: "Closed"
};

export const LEAD_STATUS_COLORS: Record<ChatLeadStatus, string> = {
  NEW: "#2563eb",
  ONGOING: "#d97706",
  FOLLOW_UP: CHAT_LEAD_BLUE,
  CLOSED: "#78716c"
};

const ALL_INBOX_STATUS_RANK: Record<ChatLeadStatus, number> = {
  NEW: 0,
  ONGOING: 1,
  FOLLOW_UP: 2,
  CLOSED: 3
};

export function resolveThreadLeadStatus(thread: {
  status?: string | null;
  leadStatus?: string | null;
  lastAdminName?: string | null;
  hasOpenFollowUp?: boolean | null;
}): ChatLeadStatus {
  if (
    thread.leadStatus === "NEW" ||
    thread.leadStatus === "ONGOING" ||
    thread.leadStatus === "FOLLOW_UP" ||
    thread.leadStatus === "CLOSED"
  ) {
    return thread.leadStatus;
  }
  if (thread.status === "CLOSED") return "CLOSED";
  if (thread.hasOpenFollowUp) return "FOLLOW_UP";
  if (thread.lastAdminName) return "ONGOING";
  return "NEW";
}

export type InboxRowMeta = {
  status: ChatLeadStatus;
  statusLabel: string | null;
  statusColor: string | null;
  attendingName: string | null;
  sourceLabel: string;
};

/** All-tab row: New/Ongoing/Follow-up only, attending if not New, then source. */
export function buildAllInboxRowMeta(thread: {
  source: string;
  status?: string | null;
  leadStatus?: string | null;
  lastAdminName?: string | null;
  hasOpenFollowUp?: boolean | null;
}): InboxRowMeta {
  const status = resolveThreadLeadStatus(thread);
  const showStatus = status === "NEW" || status === "ONGOING" || status === "FOLLOW_UP";
  return {
    status,
    statusLabel: showStatus ? LEAD_STATUS_LABELS[status] : null,
    statusColor: showStatus ? LEAD_STATUS_COLORS[status] : null,
    attendingName: status !== "NEW" ? thread.lastAdminName?.trim() || null : null,
    sourceLabel: ENQUIRY_SOURCE_LABELS[thread.source as EnquirySource] ?? thread.source
  };
}

export function compareThreadsForAllInbox(
  a: {
    lastMessageAt: string;
    status?: string | null;
    leadStatus?: string | null;
    lastAdminName?: string | null;
    hasOpenFollowUp?: boolean | null;
  },
  b: {
    lastMessageAt: string;
    status?: string | null;
    leadStatus?: string | null;
    lastAdminName?: string | null;
    hasOpenFollowUp?: boolean | null;
  }
): number {
  const rank =
    ALL_INBOX_STATUS_RANK[resolveThreadLeadStatus(a)] -
    ALL_INBOX_STATUS_RANK[resolveThreadLeadStatus(b)];
  if (rank !== 0) return rank;
  return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
}

const BOT_AUTHOR = "Sarveda Assistant";

export type ChatLeadHistoryRow = {
  key: string;
  name: string;
  firstAt: string;
  lastAt: string;
  count: number;
};

export function adminDisplayName(input: {
  authorName?: string | null;
  adminUser?: { name: string | null; email: string } | null;
}): string {
  return (
    input.adminUser?.name?.trim() ||
    input.authorName?.trim() ||
    input.adminUser?.email?.split("@")[0] ||
    ""
  );
}

export function buildChatLeadHistory(
  messages: Array<{
    authorType: string;
    authorName?: string | null;
    authorEmail?: string | null;
    createdAt: string;
    adminUser?: { id?: string; name: string | null; email: string } | null;
  }>
): ChatLeadHistoryRow[] {
  const map = new Map<string, ChatLeadHistoryRow>();
  for (const m of messages) {
    if (m.authorType !== "ADMIN") continue;
    const name = adminDisplayName(m);
    if (!name || name === BOT_AUTHOR) continue;
    const key = m.adminUser?.id || m.authorEmail || name;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { key, name, firstAt: m.createdAt, lastAt: m.createdAt, count: 1 });
    } else {
      existing.lastAt = m.createdAt;
      existing.count += 1;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  );
}

export function formatLeadWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
