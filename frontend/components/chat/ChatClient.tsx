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
    text: "Namaste. I am your Sarveda guide. Ask about singing bowls, yoga essentials, Ayurveda, shipping, or what to choose for meditation — I can suggest products from our catalog."
  }
];

function ProductSuggestions({ products }: { products: ChatProduct[] }) {
  if (products.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2 border-t border-stone-100 pt-3">
      {products.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/product/${p.slug}`}
            className="flex items-center gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-2 transition-colors hover:border-amber-200 hover:bg-amber-50/50"
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-200">
              {p.imageUrl ? (
                <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="48px" />
              ) : (
                <span className="flex h-full items-center justify-center text-[10px] text-stone-400">S</span>
              )}
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-stone-800">{p.name}</span>
              {p.priceInPaise != null ? (
                <span className="text-xs text-amber-800">{formatINRFromPaise(p.priceInPaise)}</span>
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
    <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-stone-50 md:min-h-[70vh] md:rounded-3xl md:border md:border-stone-200 md:bg-white">
      <MobileSubpageHeader title="Chat" backHref="/" />
      {chatStatus?.enabled === false ? (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 md:rounded-t-3xl">
          Set <code className="rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code> or{" "}
          <code className="rounded bg-white/60 px-1">OPENAI_API_KEY</code> on the server (
          <code className="rounded bg-white/60 px-1">AI_PROVIDER</code> optional).
        </div>
      ) : chatStatus?.provider ? (
        <div className="border-b border-stone-100 bg-stone-50/80 px-4 py-2 text-[11px] text-stone-500 md:rounded-t-3xl">
          Powered by {chatStatus.provider === "anthropic" ? "Claude" : "OpenAI"}
        </div>
      ) : null}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              message.role === "assistant"
                ? "bg-white text-stone-700 shadow-sm"
                : "ml-auto bg-stone-900 text-amber-100"
            }`}
          >
            <p className="whitespace-pre-wrap">{message.text}</p>
            {message.role === "assistant" && message.products ? (
              <ProductSuggestions products={message.products} />
            ) : null}
          </div>
        ))}
        {loading ? (
          <div className="max-w-[85%] rounded-2xl bg-white px-4 py-3 text-sm text-stone-500 shadow-sm">
            <span className="inline-flex gap-1">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse [animation-delay:150ms]">●</span>
              <span className="animate-pulse [animation-delay:300ms]">●</span>
            </span>
          </div>
        ) : null}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-stone-200 bg-white px-4 py-3 safe-area-pb md:rounded-b-3xl">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about products, shipping, yoga gear…"
            disabled={loading}
            className="min-h-[48px] flex-1 rounded-full border border-stone-200 px-4 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-amber-500 px-5 text-sm font-semibold text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
