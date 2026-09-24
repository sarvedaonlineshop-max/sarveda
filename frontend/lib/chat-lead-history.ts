export const CHAT_LEAD_BLUE = "#53bdeb";

export type ChatLeadStatus = "NEW" | "ONGOING" | "FOLLOW_UP" | "CLOSED";

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
