import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000)
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(20)
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;
