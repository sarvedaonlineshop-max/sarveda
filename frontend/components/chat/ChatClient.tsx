"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";
import {
  fetchChatStatus,
  sendChatMessage,
  type ChatProduct,
  type ChatStatus,
  type ChatTurn
} from "@/lib/chat-api";
import { formatINRFromPaise } from "@/lib/money";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  products?: ChatProduct[];
};

const starterMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Hi, I'm here to help. Ask where your order is, when it will arrive, product prices, or what to buy — I'll answer based on your question."
  }
];

function ProductSuggestions({ products }: { products: ChatProduct[] }) {
  if (products.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2 border-t border-[rgba(196,176,232,0.25)] pt-3">
      {products.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/product/${p.slug}`}
            className="flex items-center gap-3 rounded-xl border border-[rgba(196,176,232,0.25)] bg-brand-bg/80 p-2 transition-colors hover:border-brand-lavender-mid hover:bg-brand-violet-light/50"
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-violet-light">
              {p.imageUrl ? (
                <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="48px" />
              ) : (
                <span className="flex h-full items-center justify-center text-[10px] text-brand-muted">S</span>
              )}
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-brand-ink">{p.name}</span>
              {p.priceInPaise != null ? (
                <span className="text-xs text-brand-violet">{formatINRFromPaise(p.priceInPaise)}</span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatStatus, setChatStatus] = useState<ChatStatus | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchChatStatus().then(setChatStatus);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || loading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text: trimmed
      };
      setMessages((current) => [...current, userMessage]);
      setInput("");
      setLoading(true);

      const history: ChatTurn[] = [...messages, userMessage]
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.text }));

      try {
        const { reply, products } = await sendChatMessage(history);
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: reply,
            products
          }
        ]);
      } catch (err) {
        const code = (err as Error & { code?: string }).code;
        const fallback =
          code === "AI_UNAVAILABLE" || chatStatus?.enabled === false
            ? "Live AI is not enabled on this server yet. Browse the shop or search by category — we will have full guidance here soon."
            : "Something went wrong. Please try again in a moment, or browse /shop for products.";
        setMessages((current) => [
          ...current,
          { id: `assistant-${Date.now()}`, role: "assistant", text: fallback }
        ]);
      } finally {
        setLoading(false);
      }
    },
    [chatStatus?.enabled, input, loading, messages]
  );

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-brand-bg md:min-h-[70vh] md:rounded-3xl md:border md:border-[rgba(196,176,232,0.25)] md:bg-white">
      <MobileSubpageHeader title="Chat" backHref="/" />
      {chatStatus?.enabled === false ? (
        <div className="border-b border-brand-violet-light bg-brand-violet-light px-4 py-2.5 text-xs text-brand-violet-mid md:rounded-t-3xl">
          Set <code className="rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code> or{" "}
          <code className="rounded bg-white/60 px-1">OPENAI_API_KEY</code> on the server (
          <code className="rounded bg-white/60 px-1">AI_PROVIDER</code> optional).
        </div>
      ) : chatStatus?.provider ? (
        <div className="border-b border-[rgba(196,176,232,0.25)] bg-brand-bg/80 px-4 py-2 text-[11px] text-brand-muted md:rounded-t-3xl">
          Powered by {chatStatus.provider === "anthropic" ? "Claude" : "OpenAI"}
        </div>
      ) : null}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              message.role === "assistant"
                ? "bg-white text-brand-mid shadow-sm"
                : "ml-auto bg-brand-violet-deep text-brand-lavender"
            }`}
          >
            <p className="whitespace-pre-wrap">{message.text}</p>
            {message.role === "assistant" && message.products ? (
              <ProductSuggestions products={message.products} />
            ) : null}
          </div>
        ))}
        {loading ? (
          <div className="max-w-[85%] rounded-2xl bg-white px-4 py-3 text-sm text-brand-muted shadow-sm">
            <span className="inline-flex gap-1">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse [animation-delay:150ms]">●</span>
              <span className="animate-pulse [animation-delay:300ms]">●</span>
            </span>
          </div>
        ) : null}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-[rgba(196,176,232,0.25)] bg-white px-4 py-3 safe-area-pb md:rounded-b-3xl">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about products, shipping, yoga gear…"
            disabled={loading}
            className="min-h-[48px] flex-1 rounded-full border border-[rgba(196,176,232,0.25)] px-4 text-sm text-brand-ink focus:border-brand-lavender-mid focus:outline-none focus:ring-2 focus:ring-brand-lavender-mid/30 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-violet px-5 text-sm font-semibold text-brand-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
