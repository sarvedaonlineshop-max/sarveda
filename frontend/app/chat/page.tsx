import { ChatClient } from "@/components/chat/ChatClient";

export const metadata = {
  title: "Chat",
  description: "Chat with Sarveda",
  robots: { index: false, follow: false }
};

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl md:px-6 md:py-8">
      <h1 className="display-text hidden font-serif text-3xl font-semibold text-brand-ink md:block">Chat with Sarveda</h1>
      <div className="md:mt-6">
        <ChatClient />
      </div>
    </div>
  );
}
