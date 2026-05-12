"use client";

import { FormEvent, useState } from "react";

import { MobileSubpageHeader } from "@/components/layout/MobileSubpageHeader";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const starterMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "Namaste. I am your Sarveda guide. Ask about products, shipping, returns, or how to choose the right singing bowl, herb, or yoga essential."
  }
];

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [input, setInput] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed
    };
    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      text:
        "Thanks for your question. Live AI guidance is coming soon. For now, browse the shop, open your cart, or sign in to your profile while we connect the assistant."
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-stone-50 md:min-h-[70vh] md:rounded-3xl md:border md:border-stone-200 md:bg-white">
      <MobileSubpageHeader title="Chat" backHref="/" />
      <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:rounded-t-3xl">
        Guided shopping support is on the way. This window will become your live Sarveda assistant.
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              message.role === "assistant"
                ? "bg-white text-stone-700 shadow-sm"
                : "ml-auto bg-stone-900 text-amber-100"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-stone-200 bg-white px-4 py-3 safe-area-pb md:rounded-b-3xl">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Sarveda anything…"
            className="min-h-[48px] flex-1 rounded-full border border-stone-200 px-4 text-sm text-stone-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
          <button
            type="submit"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-amber-500 px-5 text-sm font-semibold text-stone-900"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
