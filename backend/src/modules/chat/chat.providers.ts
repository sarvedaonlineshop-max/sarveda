import { logger } from "../../config/logger";

export type ChatProvider = "anthropic" | "openai";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatProviderStatus = {
  enabled: boolean;
  provider: ChatProvider | null;
};

function chatFlagEnabled(): boolean {
  const flag = (process.env.ENABLE_AI_CHAT ?? "").trim().toLowerCase();
  return !["0", "false", "no"].includes(flag);
}

function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Resolve active provider: `AI_PROVIDER=anthropic|openai`, else Anthropic if both keys exist, else whichever key is set.
 */
export function resolveChatProvider(): ChatProvider | null {
  if (!chatFlagEnabled()) return null;

  const explicit = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();

  if (explicit === "anthropic") {
    return hasAnthropicKey() ? "anthropic" : null;
  }
  if (explicit === "openai") {
    return hasOpenAiKey() ? "openai" : null;
  }
  if (explicit && explicit !== "") {
    logger.warn("chat_unknown_ai_provider", { aiProvider: explicit });
    return null;
  }

  if (hasAnthropicKey()) return "anthropic";
  if (hasOpenAiKey()) return "openai";
  return null;
}

export function getChatProviderStatus(): ChatProviderStatus {
  const provider = resolveChatProvider();
  return { enabled: provider !== null, provider };
}

/** Both APIs expect alternating user ↔ assistant turns, starting with user. */
export function normalizeChatTurns(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    const chunk = t.content.slice(0, 2000);
    const last = out[out.length - 1];
    if (last?.role === t.role) {
      last.content = `${last.content}\n\n${chunk}`.slice(0, 4000);
    } else {
      out.push({ role: t.role, content: chunk });
    }
  }
  while (out.length > 0 && out[0].role !== "user") out.shift();
  return out;
}

async function callAnthropic(system: string, messages: ChatTurn[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY!.trim();
  const model = (process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001").trim();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 768,
      temperature: 0.55,
      system,
      messages: messages.map((m) => ({
        role: m.role,
        content: [{ type: "text", text: m.content }]
      }))
    })
  });

  const raw = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    error?: { type?: string; message?: string };
  };

  if (!res.ok) {
    logger.warn("anthropic_chat_error", { status: res.status, error: raw.error?.message, type: raw.error?.type });
    throw new Error(raw.error?.message ?? "Anthropic service unavailable");
  }

  const text = (raw.content ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Empty AI response");
  return text;
}

async function callOpenAi(system: string, messages: ChatTurn[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY!.trim();
  const model = (process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim();
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      temperature: 0.55,
      max_tokens: 768
    })
  });

  const raw = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    logger.warn("openai_chat_error", { status: res.status, error: raw.error?.message });
    throw new Error(raw.error?.message ?? "OpenAI service unavailable");
  }

  const text = raw.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty AI response");
  return text;
}

export async function callChatLlm(system: string, messages: ChatTurn[]): Promise<string> {
  const provider = resolveChatProvider();
  if (!provider) {
    const err = new Error("AI chat is not configured") as Error & { statusCode?: number; code?: string };
    err.statusCode = 503;
    err.code = "AI_UNAVAILABLE";
    throw err;
  }

  if (provider === "anthropic") {
    return callAnthropic(system, messages);
  }
  return callOpenAi(system, messages);
}
