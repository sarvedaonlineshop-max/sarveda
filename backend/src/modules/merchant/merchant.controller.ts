import type { Request, Response, NextFunction } from "express";

import { logger } from "../../config/logger";
import { buildGoogleMerchantFeed } from "./googleMerchantFeed";
import { buildCtxCompatibilityFeed } from "./ctxCompatibilityFeed";
import { buildSarvedaProductsFeed } from "./sarvedaProductsFeed";

/** GET /api/merchant/google/products.xml — public Merchant File(URL) feed (read-only). */
export async function googleProductsXml(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { xml, diagnostics } = await buildGoogleMerchantFeed();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    // Merchant schedules fetches; keep short enough that price/stock stay reasonably fresh.
    res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=900");
    res.setHeader("X-Sarveda-Merchant-Feed-Items", String(diagnostics.eligibleItems));
    res.status(200).send(xml);
  } catch (err) {
    logger.error("merchant_google_feed_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    next(err);
  }
}

/** GET /api/merchant/google/products-source-2.xml — CTX PRODUCTS SOURCE 2 compatibility feed. */
export async function googleProductsSource2Xml(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { xml, diagnostics } = await buildCtxCompatibilityFeed();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=900");
    res.setHeader("X-Sarveda-Merchant-Feed-Items", String(diagnostics.publishedItems));
    res.setHeader("X-Sarveda-Merchant-Ctx-Registry-Total", String(diagnostics.registryTotal));
    res.setHeader("X-Sarveda-Merchant-Ctx-Publish-Classified", String(diagnostics.publishClassification));
    res.status(200).send(xml);
  } catch (err) {
    logger.error("merchant_ctx_compatibility_feed_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    next(err);
  }
}

/** GET /api/merchant/google/sarveda-products.xml — final native catalog feed (764 + native-only). */
export async function googleSarvedaProductsXml(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { xml, diagnostics } = await buildSarvedaProductsFeed();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=900");
    res.setHeader("X-Sarveda-Merchant-Feed-Items", String(diagnostics.totalItems));
    res.setHeader("X-Sarveda-Merchant-Historical-Items", String(diagnostics.historicalItems));
    res.setHeader("X-Sarveda-Merchant-Native-Only-Items", String(diagnostics.nativeOnlyItems));
    res.setHeader("X-Sarveda-Merchant-Active-Shop-Offers", String(diagnostics.activeShopOffers));
    res.status(200).send(xml);
  } catch (err) {
    logger.error("merchant_sarveda_products_feed_failed", {
      error: err instanceof Error ? err.message : String(err)
    });
    next(err);
  }
}
