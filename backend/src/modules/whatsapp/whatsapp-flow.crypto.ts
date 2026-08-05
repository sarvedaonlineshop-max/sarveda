import {
  constants,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  privateDecrypt
} from "crypto";
import { z } from "zod";

export const encryptedFlowRequestSchema = z.object({
  encrypted_aes_key: z.string().min(1).max(4096),
  encrypted_flow_data: z.string().min(1).max(1_000_000),
  initial_vector: z.string().min(1).max(1024)
});

export type FlowCryptoContext = {
  aesKey: Buffer;
  initialVector: Buffer;
};

function privateKeyPem(): string {
  const fromBase64 = process.env.WHATSAPP_FLOW_PRIVATE_KEY_B64?.trim();
  if (fromBase64) {
    return Buffer.from(fromBase64, "base64").toString("utf8");
  }
  const raw = process.env.WHATSAPP_FLOW_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("WHATSAPP_FLOW_PRIVATE_KEY is not configured");
  return raw.replace(/\\n/g, "\n");
}

export function decryptFlowRequest(body: z.infer<typeof encryptedFlowRequestSchema>): {
  decrypted: unknown;
  crypto: FlowCryptoContext;
} {
  const aesKey = privateDecrypt(
    {
      key: createPrivateKey(privateKeyPem()),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from(body.encrypted_aes_key, "base64")
  );

  const encrypted = Buffer.from(body.encrypted_flow_data, "base64");
  const initialVector = Buffer.from(body.initial_vector, "base64");
  if (encrypted.length <= 16 || initialVector.length !== 12) {
    throw new Error("Invalid encrypted Flow payload");
  }

  const ciphertext = encrypted.subarray(0, -16);
  const authTag = encrypted.subarray(-16);
  const decipher = createDecipheriv("aes-128-gcm", aesKey, initialVector);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  return {
    decrypted: JSON.parse(plaintext) as unknown,
    crypto: { aesKey, initialVector }
  };
}

export function encryptFlowResponse(response: unknown, crypto: FlowCryptoContext): string {
  const flippedVector = Buffer.from(crypto.initialVector.map((byte) => ~byte));
  const cipher = createCipheriv("aes-128-gcm", crypto.aesKey, flippedVector);
  return Buffer.concat([
    cipher.update(JSON.stringify(response), "utf8"),
    cipher.final(),
    cipher.getAuthTag()
  ]).toString("base64");
}
