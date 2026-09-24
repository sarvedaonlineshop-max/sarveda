export const ENQUIRY_LEAD_STATUSES = ["NEW", "ONGOING", "FOLLOW_UP", "CLOSED"] as const;
export type EnquiryLeadStatus = (typeof ENQUIRY_LEAD_STATUSES)[number];

export function isEnquiryLeadStatus(value: string): value is EnquiryLeadStatus {
  return (ENQUIRY_LEAD_STATUSES as readonly string[]).includes(value);
}

export function resolveEnquiryLeadStatus(flags: {
  threadStatus: "OPEN" | "CLOSED" | string;
  hasHumanAdmin: boolean;
  hasOpenFollowUp: boolean;
}): EnquiryLeadStatus {
  if (flags.threadStatus === "CLOSED") return "CLOSED";
  if (flags.hasOpenFollowUp) return "FOLLOW_UP";
  if (flags.hasHumanAdmin) return "ONGOING";
  return "NEW";
}

export function enquiryLeadStatusWhere(
  leadStatus: EnquiryLeadStatus,
  botAuthor: string
): Record<string, unknown> {
  const attended = {
    messages: {
      some: {
        authorType: "ADMIN" as const,
        authorName: { not: botAuthor }
      }
    }
  };
  const unattended = {
    messages: {
      none: {
        authorType: "ADMIN" as const,
        authorName: { not: botAuthor }
      }
    }
  };
  const hasOpenFollowUp = { followUps: { some: { status: "OPEN" as const } } };
  const noOpenFollowUp = { followUps: { none: { status: "OPEN" as const } } };

  if (leadStatus === "CLOSED") return { status: "CLOSED" };
  if (leadStatus === "NEW") return { status: "OPEN", ...unattended };
  if (leadStatus === "FOLLOW_UP") return { status: "OPEN", ...hasOpenFollowUp };
  return { status: "OPEN", ...attended, ...noOpenFollowUp };
}
