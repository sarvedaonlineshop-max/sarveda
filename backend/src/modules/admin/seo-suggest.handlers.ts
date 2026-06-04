import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { callChatLlm, getChatProviderStatus } from "../chat/chat.providers";
import { localSeoSuggest, polishSeoFields } from "../../utils/seo-suggest";

const bodySchema = z.object({
  name: z.string().min(1).max(500),
  slug: z.string().max(220).optional(),
  shortDescription: z.string().max(2000).optional(),
  description: z.string().max(8000).optional(),
  categoryNames: z.array(z.string()).optional()
});

function parseJsonBlock(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]!.trim() : text.trim();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function suggestProductSeo(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.issues.map((i) => i.message).join("; "),
        code: "VALIDATION_ERROR"
      });
      return;
    }

    const input = parsed.data;
    const fallback = localSeoSuggest(input);
    const { enabled } = getChatProviderStatus();

    if (!enabled) {
      res.json({ success: true, data: { ...fallback, source: "local" as const } });
      return;
    }

    const categories = input.categoryNames?.length ? input.categoryNames.join(", ") : "General";
    const system = `You are an SEO expert for Sarveda, an Indian wellness e-commerce brand.
Return ONLY valid JSON: seoTitle (exactly 50-60 chars), seoDescription (exactly 120-158 chars), seoKeyword (exactly 2 words).
Rules: seoKeyword MUST appear verbatim in both seoTitle and seoDescription; title must end with "| Sarveda"; no markdown.`;

    const user = `Product: ${input.name}
Slug: ${input.slug ?? ""}
Categories: ${categories}
Short: ${input.shortDescription ?? ""}
Description: ${(input.description ?? "").slice(0, 1500)}`;

    try {
      const raw = await callChatLlm(system, [{ role: "user", content: user }]);
      const obj = parseJsonBlock(raw);
      const polished = polishSeoFields(
        {
          seoTitle: String(obj?.seoTitle ?? fallback.seoTitle),
          seoDescription: String(obj?.seoDescription ?? fallback.seoDescription),
          seoKeyword: String(obj?.seoKeyword ?? fallback.seoKeyword)
        },
        input
      );
      res.json({
        success: true,
        data: { ...polished, source: "ai" as const }
      });
    } catch {
      res.json({ success: true, data: { ...fallback, source: "local" as const } });
    }
  } catch (err) {
    next(err);
  }
}
