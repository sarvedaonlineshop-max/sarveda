import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";

const tokenPayloadSchema = z.object({
  v: z.literal(1),
  phone: z.string().regex(/^\+\d{10,15}$/),
  exp: z.number().int().positive(),
  nonce: z.string().min(8).max(64)
});

type FlowTokenPayload = z.infer<typeof tokenPayloadSchema>;

function tokenSecret(): string {
  const secret =
    process.env.WHATSAPP_FLOW_TOKEN_SECRET?.trim() ||
    process.env.EXOTEL_WEBHOOK_TOKEN?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("WHATSAPP_FLOW_TOKEN_SECRET must be at least 32 characters");
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", tokenSecret()).update(encodedPayload).digest("base64url");
}

export function createSupportFlowToken(phone: string): string {
  const payload: FlowTokenPayload = {
    v: 1,
    phone,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    nonce: randomBytes(12).toString("hex")
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySupportFlowToken(token: string): FlowTokenPayload | null {
  const [encoded, providedSignature, extra] = token.split(".");
  if (!encoded || !providedSignature || extra) return null;

  const expectedSignature = sign(encoded);
  const a = Buffer.from(providedSignature, "utf8");
  const b = Buffer.from(expectedSignature, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = tokenPayloadSchema.safeParse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    );
    if (!parsed.success || parsed.data.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
