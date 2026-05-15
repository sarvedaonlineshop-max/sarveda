import {
  buildChatContext,
  buildChatSystemPrompt,
  type ChatProductSuggestion,
  type ChatTurn
} from "./chat.context";
import { callChatLlm, getChatProviderStatus, normalizeChatTurns } from "./chat.providers";
import type { ChatRequestBody } from "./chat.schemas";

export type { ChatProductSuggestion };

export type ChatReply = {
  reply: string;
  products: ChatProductSuggestion[];
};

export function chatServiceAvailable(): boolean {
  return getChatProviderStatus().enabled;
}

export function getChatStatus() {
  return getChatProviderStatus();
}

export async function runChat(
  body: ChatRequestBody,
  userHint?: { name?: string | null; email?: string | null }
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

  const turns: ChatTurn[] = body.messages.map((m) => ({
    role: m.role,
    content: m.content.slice(0, 2000)
  }));

  const ctx = await buildChatContext(turns, userHint);
  const system = buildChatSystemPrompt(ctx.systemSections, ctx.intent);

  let history = normalizeChatTurns(
    turns.slice(-12).map((m) => ({
      role: m.role,
      content: m.content
    }))
  );

  if (history.length === 0) {
    history = [{ role: "user", content: lastUser.content.slice(0, 2000) }];
  }

  const reply = await callChatLlm(system, history);

  return {
    reply,
    products: ctx.showProductCards ? ctx.products : []
  };
}
