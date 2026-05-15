import { getApiBase } from "./api";

export type ChatProduct = {
  slug: string;
  name: string;
  imageUrl: string | null;
  priceInPaise: number | null;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatStatus = {
  enabled: boolean;
  provider: "anthropic" | "openai" | null;
};

export async function fetchChatStatus(): Promise<ChatStatus> {
  try {
    const res = await fetch(`${getApiBase()}/api/chat/status`, { credentials: "include" });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { enabled?: boolean; provider?: "anthropic" | "openai" | null };
    };
    if (!json.success || !json.data) {
      return { enabled: false, provider: null };
    }
    return {
      enabled: Boolean(json.data.enabled),
      provider: json.data.provider ?? null
    };
  } catch {
    return { enabled: false, provider: null };
  }
}

export async function sendChatMessage(messages: ChatTurn[]): Promise<{ reply: string; products: ChatProduct[] }> {
  const res = await fetch(`${getApiBase()}/api/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });

  const json = (await res.json()) as {
    success?: boolean;
    data?: { reply: string; products: ChatProduct[] };
    error?: string;
    code?: string;
  };

  if (!res.ok || !json.success || !json.data) {
    const err = new Error(json.error ?? "Could not reach Sarveda assistant") as Error & { code?: string };
    err.code = json.code;
    throw err;
  }

  return json.data;
}
