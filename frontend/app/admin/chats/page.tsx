export default function AdminChatsIndexPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#efe8dc] px-6 text-center">
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white"
        style={{ background: "linear-gradient(135deg, #128c7e, #25d366)" }}
        aria-hidden
      >
        💬
      </div>
      <h2 className="text-xl font-semibold text-[#1c352a]">Sarveda Chats</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-stone-500">
        Select a conversation from the list, or start a new WhatsApp chat to message a customer.
      </p>
    </div>
  );
}
