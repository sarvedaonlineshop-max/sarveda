import { EventEmitter } from "events";

export type EnquiryRealtimeEvent =
  | { type: "thread_changed"; threadId: string }
  | { type: "message_changed"; threadId: string }
  | {
      type: "admin_typing";
      threadId: string;
      adminId: string;
      adminName: string;
      typing: boolean;
    };

const bus = new EventEmitter();
bus.setMaxListeners(250);

const typingTimers = new Map<string, NodeJS.Timeout>();

export function publishEnquiryEvent(event: EnquiryRealtimeEvent): void {
  bus.emit("event", event);
}

export function subscribeToEnquiryEvents(
  listener: (event: EnquiryRealtimeEvent) => void
): () => void {
  bus.on("event", listener);
  return () => bus.off("event", listener);
}

/**
 * Typing presence is ephemeral. Each keystroke refreshes a four-second timer;
 * stopping, blurring, or sending clears it explicitly.
 */
export function setAdminTyping(input: {
  threadId: string;
  adminId: string;
  adminName: string;
  typing: boolean;
}): void {
  const key = `${input.threadId}:${input.adminId}`;
  const existing = typingTimers.get(key);
  if (existing) clearTimeout(existing);
  typingTimers.delete(key);

  publishEnquiryEvent({ type: "admin_typing", ...input });
  if (!input.typing) return;

  const timer = setTimeout(() => {
    typingTimers.delete(key);
    publishEnquiryEvent({ type: "admin_typing", ...input, typing: false });
  }, 4_000);
  timer.unref?.();
  typingTimers.set(key, timer);
}
