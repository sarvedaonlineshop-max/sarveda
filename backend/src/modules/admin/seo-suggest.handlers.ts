import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { callChatLlm, getChatProviderStatus } from "../chat/chat.providers";
import { localSeoSuggest, polishSeoFields, type SeoSuggestInput } from "../../utils/seo-suggest";

const bodySchema = z.object({
  name: z.string().min(1).max(500),
  slug: z.string().max(220).optional(),
  shortDescription: z.string().max(2000).optional(),
  description: z.string().max(8000).optional(),
  categoryNames: z.array(z.string()).optional(),
  teachers: z.array(z.string()).optional(),
  duration: z.string().max(200).optional(),
  expertise: z.string().max(500).optional()
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

async function runSeoSuggest(
  input: SeoSuggestInput,
  system: string,
  user: string
): Promise<{ seoTitle: string; seoDescription: string; seoKeyword: string; source: "ai" | "local" }> {
  const fallback = localSeoSuggest(input);
  const { enabled } = getChatProviderStatus();

  if (!enabled) {
    return { ...fallback, source: "local" };
  }

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
    return { ...polished, source: "ai" };
  } catch {
    return { ...fallback, source: "local" };
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
    const categories = input.categoryNames?.length ? input.categoryNames.join(", ") : "General";
    const system = `You are an SEO expert for Sarveda, an Indian wellness e-commerce brand.
Return ONLY valid JSON: seoTitle (exactly 50-60 chars), seoDescription (exactly 120-158 chars), seoKeyword (exactly 2 words).
Rules: seoKeyword MUST appear verbatim in both seoTitle and seoDescription; title must end with "| Sarveda"; no markdown.`;

    const user = `Product: ${input.name}
Slug: ${input.slug ?? ""}
Categories: ${categories}
Short: ${input.shortDescription ?? ""}
Description: ${(input.description ?? "").slice(0, 1500)}`;

    const data = await runSeoSuggest(input, system, user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function suggestCourseSeo(req: Request, res: Response, next: NextFunction) {
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
    const teachers = input.teachers?.filter(Boolean).join(", ") || "";
    const system = `You are an SEO expert for Sarveda wellness courses (yoga, meditation, sound healing, ayurveda).
Return ONLY valid JSON: seoTitle (exactly 50-60 chars), seoDescription (exactly 120-158 chars), seoKeyword (exactly 2 words).
Rules: seoKeyword MUST appear verbatim in both seoTitle and seoDescription; title must end with "| Sarveda"; no markdown; write for people searching courses and workshops in India.`;

    const user = `Course: ${input.name}
Slug: ${input.slug ?? ""}
Short: ${input.shortDescription ?? ""}
Duration: ${input.duration ?? ""}
Teachers: ${teachers}
Description: ${(input.description ?? "").slice(0, 1500)}`;

    const data = await runSeoSuggest(input, system, user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function suggestMentorSeo(req: Request, res: Response, next: NextFunction) {
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
    const system = `You are an SEO expert for Sarveda wellness mentors (yoga, meditation, sound healing, ayurveda teachers).
Return ONLY valid JSON: seoTitle (exactly 50-60 chars), seoDescription (exactly 120-158 chars), seoKeyword (exactly 2 words).
Rules: seoKeyword MUST appear verbatim in both seoTitle and seoDescription; title must end with "| Sarveda"; no markdown; highlight the mentor's expertise and credibility.`;

    const user = `Mentor: ${input.name}
Slug: ${input.slug ?? ""}
Expertise: ${input.expertise ?? ""}
Bio: ${(input.description ?? input.shortDescription ?? "").slice(0, 1500)}`;

    const data = await runSeoSuggest(input, system, user);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
