import type { Prisma } from "@prisma/client";

import { logger } from "../../config/logger";
import { sanitizeAttributionPayload } from "./sanitize";

type Tx = Prisma.TransactionClient;

/**
 * Persist OrderAttribution inside the order-create transaction.
 * Never throws for bad/missing attribution — logs and skips.
 */
export async function createOrderAttributionInTx(
  tx: Tx,
  orderId: string,
  rawAttribution: unknown,
  userAgent: string | null | undefined
): Promise<boolean> {
  try {
    const sanitized = sanitizeAttributionPayload(rawAttribution, { userAgent });
    if (!sanitized) return false;

    await tx.orderAttribution.create({
      data: {
        orderId,
        sourceType: sanitized.sourceType,
        firstSource: sanitized.firstSource,
        firstMedium: sanitized.firstMedium,
        firstCampaign: sanitized.firstCampaign,
        firstReferrer: sanitized.firstReferrer,
        firstLandingPage: sanitized.firstLandingPage,
        lastSource: sanitized.lastSource,
        lastMedium: sanitized.lastMedium,
        lastCampaign: sanitized.lastCampaign,
        lastReferrer: sanitized.lastReferrer,
        lastLandingPage: sanitized.lastLandingPage,
        utmSource: sanitized.utmSource,
        utmMedium: sanitized.utmMedium,
        utmCampaign: sanitized.utmCampaign,
        utmContent: sanitized.utmContent,
        utmTerm: sanitized.utmTerm,
        gclid: sanitized.gclid,
        fbclid: sanitized.fbclid,
        referringDomain: sanitized.referringDomain,
        landingPath: sanitized.landingPath,
        deviceType: sanitized.deviceType,
        sessionPageViews: sanitized.sessionPageViews,
        sessionStartedAt: sanitized.sessionStartedAt,
        capturedAt: sanitized.capturedAt
      }
    });
    return true;
  } catch (err) {
    logger.warn("order_attribution_persist_skipped", {
      orderId,
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}
