import { getCategoryTree } from "../categories/categories.service";
import { suggestProducts } from "../products/products.service";

import {
  callChatLlm,
  getChatProviderStatus,
  normalizeChatTurns,
  type ChatTurn
} from "./chat.providers";
import type { ChatRequestBody } from "./chat.schemas";

export type ChatProductSuggestion = {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceInPaise: number | null;
};

export type ChatReply = {
  reply: string;
  products: ChatProductSuggestion[];
};

function formatInr(paise: number | null): string {
  if (paise == null) return "price on request";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function flattenCategoryNames(nodes: Awaited<ReturnType<typeof getCategoryTree>>, depth = 0): string[] {
  const lines: string[] = [];
  for (const n of nodes) {
    lines.push(`${"  ".repeat(depth)}${n.name} (/product-category/${n.slug})`);
    if (n.children.length > 0 && depth < 1) {
      lines.push(...flattenCategoryNames(n.children, depth + 1));
    }
  }
  return lines;
}

async function gatherProductContext(query: string): Promise<ChatProductSuggestion[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const seen = new Set<string>();
  const out: ChatProductSuggestion[] = [];

  const add = (items: ChatProductSuggestion[]) => {
    for (const p of items) {
      if (seen.has(p.slug)) continue;
      seen.add(p.slug);
      out.push(p);
      if (out.length >= 8) return;
    }
  };

  add(await suggestProducts(term, 8));

  if (out.length < 4) {
    const words = term
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 4);
    for (const w of words) {
      add(await suggestProducts(w, 4));
      if (out.length >= 8) break;
    }
  }

  return out;
}

function buildSystemPrompt(categoryLines: string[], products: ChatProductSuggestion[]): string {
  const productBlock =
    products.length > 0
      ? products
          .map(
            (p) =>
              `- ${p.name} | ${formatInr(p.priceInPaise)} | https://sarveda.com/product/${p.slug}`
          )
          .join("\n")
      : "(No specific products matched this message — suggest browsing /shop or /search.)";

  return `You are the Sarveda shopping guide — warm, concise, and knowledgeable about yoga, meditation, sound healing, Ayurveda, and sustainable living products.

Rules:
- Answer in English unless the customer writes in another language.
- Recommend only real Sarveda products from the catalog context below. Never invent SKUs, prices, or URLs.
- When suggesting products, mention name and price in INR and include the product path as /product/{slug}.
- For order status, payments, refunds, or account issues: direct them to /my-account or email hello@sarveda.com — you cannot access their orders.
- India: Razorpay online payment and Cash on Delivery (where available). Typical delivery 5–8 business days after dispatch.
- International: Stripe / PayPal; shipping varies by country.
- Keep replies under 120 words unless the question needs a short list.
- Do not claim medical cures; use gentle wellness language for herbs and Ayurveda.

Store paths: /shop (all products), /search (browse categories), /cart, /checkout, /chat

Top categories:
${categoryLines.join("\n")}

Relevant products for this message:
${productBlock}`;
}

export function chatServiceAvailable(): boolean {
  return getChatProviderStatus().enabled;
}

export function getChatStatus() {
  return getChatProviderStatus();
}

export async function runChat(
  body: ChatRequestBody,
  userHint?: { name?: string | null; email?: string }
): Promise<ChatReply> {
  if (!chatServiceAvailable()) {
    const err = new Error("AI chat is not configured") as Error & { statusCode?: number; code?: string };
    err.statusCode = 503;
    err.code = "AI_UNAVAILABLE";
    throw err;
  }

  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    const err = new Error("No user message") as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const [categories, products] = await Promise.all([
    getCategoryTree(),
    gatherProductContext(lastUser.content)
  ]);

  const categoryLines = flattenCategoryNames(categories);
  let system = buildSystemPrompt(categoryLines, products);
  if (userHint?.name || userHint?.email) {
    system += `\n\nLogged-in customer: ${userHint.name ?? "guest"}${userHint.email ? ` (${userHint.email})` : ""}.`;
  }

  let history: ChatTurn[] = normalizeChatTurns(
    body.messages.slice(-12).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 2000)
    }))
  );

  if (history.length === 0) {
    history = [{ role: "user", content: lastUser.content.slice(0, 2000) }];
  }

  const reply = await callChatLlm(system, history);

  return { reply, products };
}
