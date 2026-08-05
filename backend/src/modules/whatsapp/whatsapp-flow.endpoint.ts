import type { Request, Response } from "express";

import { logger } from "../../config/logger";
import {
  decryptFlowRequest,
  encryptedFlowRequestSchema,
  encryptFlowResponse
} from "./whatsapp-flow.crypto";
import { handleDecryptedFlowRequest } from "./whatsapp-flow.service";

export async function whatsappFlowEndpointHandler(req: Request, res: Response): Promise<void> {
  const envelope = encryptedFlowRequestSchema.safeParse(req.body);
  if (!envelope.success) {
    logger.warn("whatsapp_flow_bad_envelope", { issues: envelope.error.issues, ip: req.ip });
    res.status(400).json({ error: "Invalid encrypted Flow request" });
    return;
  }

  let decrypted: unknown;
  let crypto;
  try {
    const result = decryptFlowRequest(envelope.data);
    decrypted = result.decrypted;
    crypto = result.crypto;
  } catch (err) {
    logger.warn("whatsapp_flow_decrypt_failed", {
      error: err instanceof Error ? err.message : String(err),
      ip: req.ip
    });
    // Meta uses 421 to refresh the configured public key and retry.
    res.status(421).send();
    return;
  }

  try {
    const flowResponse = await handleDecryptedFlowRequest(decrypted);
    res.type("text/plain").send(encryptFlowResponse(flowResponse, crypto));
  } catch (err) {
    logger.error("whatsapp_flow_endpoint_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    const fallback = {
      version: "3.0",
      screen: "ERROR",
      data: { message: "Something went wrong. Please return to WhatsApp and send Hi again." }
    };
    res.type("text/plain").send(encryptFlowResponse(fallback, crypto));
  }
}
