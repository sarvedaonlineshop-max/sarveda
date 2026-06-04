import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { callChatLlm, getChatProviderStatus } from "../chat/chat.providers";

const bodySchema = z.object({
  name: z.string().min(1).max(500),
  slug: z.string().max(220).optional(),
  shortDescription: z.string().max(2000).optional(),
  description: z.string().max(8000).optional(),
  categoryNames: z.array(z.string()).optional()
});

function localSeoSuggest(input: z.infer<typeof bodySchema>) {
  const name = input.name.trim();
  const short = (input.shortDescription ?? "").trim();
  const desc = (input.description ?? short).trim();
  const words = name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const keyword = words.slice(0, 3).join(" ") || name.toLowerCase().slice(0, 40);

  let seoTitle = `${name} | Buy Online at Sarveda`;
  if (seoTitle.length > 60) {
    seoTitle = `${name.slice(0, 42).trim()} | Sarveda`;
  }
  if (seoTitle.length < 50) {
    seoTitle = `${seoTitle.replace(/\s*\|\s*Sarveda$/, "")} — Sarveda`.slice(0, 60);
  }

  let base = short || desc.slice(0, 200);
  if (!base.toLowerCase().includes(keyword.toLowerCase())) {
    base = `${keyword}. ${base}`;
  }
  let seoDescription = base.replace(/\s+/g, " ").trim();
  if (seoDescription.length < 120) {
    seoDescription = `${seoDescription} Shop authentic wellness products at Sarveda with fast delivery.`.slice(
      0,
      158
    );
  }
  if (seoDescription.length > 158) {
    seoDescription = `${seoDescription.slice(0, 155).trim()}…`;
  }

  return { seoTitle, seoDescription, seoKeyword: keyword };
}

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
Return ONLY valid JSON with keys: seoTitle (50-60 chars), seoDescription (120-158 chars), seoKeyword (2-4 words).
Rules: include focus keyword in title and description; title must end with "| Sarveda"; description must be compelling for Google; no markdown.`;

    const user = `Product: ${input.name}
Slug: ${input.slug ?? ""}
Categories: ${categories}
Short: ${input.shortDescription ?? ""}
Description: ${(input.description ?? "").slice(0, 1500)}`;

    try {
      const raw = await callChatLlm(system, [{ role: "user", content: user }]);
      const obj = parseJsonBlock(raw);
      const seoTitle = String(obj?.seoTitle ?? fallback.seoTitle).trim().slice(0, 60);
      const seoDescription = String(obj?.seoDescription ?? fallback.seoDescription)
        .trim()
        .slice(0, 158);
      const seoKeyword = String(obj?.seoKeyword ?? fallback.seoKeyword).trim().slice(0, 80);
      res.json({
        success: true,
        data: { seoTitle, seoDescription, seoKeyword, source: "ai" as const }
      });
    } catch {
      res.json({ success: true, data: { ...fallback, source: "local" as const } });
    }
  } catch (err) {
    next(err);
  }
}
