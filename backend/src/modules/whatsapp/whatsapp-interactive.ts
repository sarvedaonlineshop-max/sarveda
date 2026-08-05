/**
 * WhatsApp interactive messages (reply buttons + list menus) over Exotel.
 *
 * These are plain session messages — unlike Meta Flows they need no endpoint,
 * signed public key, connected Meta app, or publish approval. They only work
 * inside the customer's 24h window, which the support bot always is (the
 * customer messaged us first).
 *
 * WhatsApp enforces hard limits and rejects the whole message if any field is
 * over, so every field is clamped here rather than at each call site.
 */
import { sendExotelWhatsAppContent } from "./whatsapp-exotel";

const LIMITS = {
  header: 60,
  body: 1024,
  footer: 60,
  buttonTitle: 20,
  buttonId: 256,
  listButton: 20,
  rowTitle: 24,
  rowDescription: 72,
  rowId: 200,
  sectionTitle: 24,
  maxButtons: 3,
  maxRows: 10
} as const;

function clamp(value: string, max: number): string {
  const text = (value ?? "").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export type ReplyButton = { id: string; title: string };

export type ListRow = { id: string; title: string; description?: string };

export type ListSection = { title?: string; rows: ListRow[] };

type Envelope = { header?: string; body: string; footer?: string };

function envelopeFields(envelope: Envelope): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    body: { text: clamp(envelope.body, LIMITS.body) }
  };
  if (envelope.header) {
    fields.header = { type: "text", text: clamp(envelope.header, LIMITS.header) };
  }
  if (envelope.footer) {
    fields.footer = { text: clamp(envelope.footer, LIMITS.footer) };
  }
  return fields;
}

/** Send up to 3 quick-reply buttons. Extra buttons are dropped, not silently rejected by Meta. */
export async function sendWhatsAppButtons(
  toE164: string,
  envelope: Envelope,
  buttons: ReplyButton[]
): Promise<string | null> {
  const trimmed = buttons.slice(0, LIMITS.maxButtons);
  if (trimmed.length === 0) {
    throw new Error("sendWhatsAppButtons requires at least one button");
  }

  return sendExotelWhatsAppContent(
    toE164,
    {
      type: "interactive",
      interactive: {
        type: "button",
        ...envelopeFields(envelope),
        action: {
          buttons: trimmed.map((button) => ({
            type: "reply",
            reply: {
              id: clamp(button.id, LIMITS.buttonId),
              title: clamp(button.title, LIMITS.buttonTitle)
            }
          }))
        }
      }
    },
    "whatsapp_buttons_sent"
  );
}

/**
 * Send a list menu (the "≡ Menu" style message).
 * WhatsApp caps the total row count across all sections at 10.
 */
export async function sendWhatsAppList(
  toE164: string,
  envelope: Envelope,
  buttonLabel: string,
  sections: ListSection[]
): Promise<string | null> {
  let remaining = LIMITS.maxRows;
  const payloadSections: Record<string, unknown>[] = [];

  for (const section of sections) {
    if (remaining <= 0) break;
    const rows = section.rows.slice(0, remaining);
    if (rows.length === 0) continue;
    remaining -= rows.length;

    const payloadSection: Record<string, unknown> = {
      rows: rows.map((row) => {
        const entry: Record<string, unknown> = {
          id: clamp(row.id, LIMITS.rowId),
          title: clamp(row.title, LIMITS.rowTitle)
        };
        if (row.description) {
          entry.description = clamp(row.description, LIMITS.rowDescription);
        }
        return entry;
      })
    };
    if (section.title) {
      payloadSection.title = clamp(section.title, LIMITS.sectionTitle);
    }
    payloadSections.push(payloadSection);
  }

  if (payloadSections.length === 0) {
    throw new Error("sendWhatsAppList requires at least one row");
  }

  return sendExotelWhatsAppContent(
    toE164,
    {
      type: "interactive",
      interactive: {
        type: "list",
        ...envelopeFields(envelope),
        action: {
          button: clamp(buttonLabel, LIMITS.listButton),
          sections: payloadSections
        }
      }
    },
    "whatsapp_list_sent"
  );
}

/** Send a plain session text message. */
export async function sendWhatsAppText(toE164: string, body: string): Promise<string | null> {
  return sendExotelWhatsAppContent(
    toE164,
    {
      recipient_type: "individual",
      type: "text",
      text: { body: body.slice(0, 4096) }
    },
    "whatsapp_session_text_sent"
  );
}
