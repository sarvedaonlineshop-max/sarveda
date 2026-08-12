import type { NextFunction, Request, Response } from "express";

import { getAmazonConnectionStatus, startAmazonMarketplaceSync, syncAmazonOrders } from "./amazon/amazon-orders-sync";
import { getEtsyConnectionStatus, startEtsyMarketplaceSync } from "./etsy/etsy-sync";
import { getFlipkartConnectionStatus, syncFlipkartMarketplace } from "./flipkart/flipkart-sync";
import * as service from "./marketplaces.service";

type ChannelCode = Parameters<typeof service.listMarketplaceListings>[0] extends infer T
  ? T extends { channelCode?: infer U }
    ? U
    : never
  : never;

export async function overview(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await service.getMarketplaceOverview() });
  } catch (err) {
    next(err);
  }
}

export async function listings(req: Request, res: Response, next: NextFunction) {
  try {
    const channelCode = typeof req.query.channelCode === "string" ? req.query.channelCode : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    res.json({
      success: true,
      data: await service.listMarketplaceListings({
        channelCode: channelCode as ChannelCode,
        status: status as "ACTIVE" | "PAUSED" | "DELISTED" | undefined,
        search
      })
    });
  } catch (err) {
    next(err);
  }
}

export async function createListing(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await service.upsertMarketplaceListing(req.body) });
  } catch (err) {
    next(err);
  }
}

export async function updateListing(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      success: true,
      data: await service.patchMarketplaceListing(req.params.id, req.body)
    });
  } catch (err) {
    next(err);
  }
}

export async function orders(req: Request, res: Response, next: NextFunction) {
  try {
    const channelCode = typeof req.query.channelCode === "string" ? req.query.channelCode : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    res.json({
      success: true,
      data: await service.listMarketplaceOrders({
        channelCode: channelCode as ChannelCode,
        status,
        search,
        from,
        to
      })
    });
  } catch (err) {
    next(err);
  }
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await service.createMarketplaceOrder(req.body) });
  } catch (err) {
    next(err);
  }
}

export async function importOrders(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await service.importMarketplaceOrders(req.body) });
  } catch (err) {
    next(err);
  }
}

export async function returnsList(req: Request, res: Response, next: NextFunction) {
  try {
    const channelCode = typeof req.query.channelCode === "string" ? req.query.channelCode : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    res.json({
      success: true,
      data: await service.listMarketplaceReturns({
        channelCode: channelCode as ChannelCode,
        status,
        search,
        from,
        to
      })
    });
  } catch (err) {
    next(err);
  }
}

export async function createReturn(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await service.createMarketplaceReturn(req.body) });
  } catch (err) {
    next(err);
  }
}

export async function analytics(req: Request, res: Response, next: NextFunction) {
  try {
    const channelCode = typeof req.query.channelCode === "string" ? req.query.channelCode : undefined;
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    res.json({
      success: true,
      data: await service.getMarketplaceAnalytics({
        channelCode: channelCode as ChannelCode,
        from,
        to
      })
    });
  } catch (err) {
    next(err);
  }
}

export async function inbox(req: Request, res: Response, next: NextFunction) {
  try {
    const channelCode = typeof req.query.channelCode === "string" ? req.query.channelCode : undefined;
    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
    res.json({
      success: true,
      data: await service.listMarketplaceInbox({
        channelCode: channelCode as ChannelCode,
        limit
      })
    });
  } catch (err) {
    next(err);
  }
}

export async function ingestEmail(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await service.createMarketplaceEmailEvent(req.body) });
  } catch (err) {
    next(err);
  }
}

export async function amazonConnection(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: getAmazonConnectionStatus() });
  } catch (err) {
    next(err);
  }
}

export async function amazonSyncOrders(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await syncAmazonOrders(req.body ?? {}) });
  } catch (err) {
    next(err);
  }
}

export async function amazonSyncAll(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.body ?? {}) as {
      monthsBack?: number;
      daysBack?: number;
      maxPagesPerMonth?: number;
      maxPages?: number;
      includeShipped?: boolean;
      orderStatuses?: string[];
    };
    const monthsBack =
      typeof body.monthsBack === "number"
        ? body.monthsBack
        : typeof body.daysBack === "number"
          ? Math.max(1, Math.ceil(body.daysBack / 30))
          : 24;
    const maxPagesPerMonth =
      typeof body.maxPagesPerMonth === "number"
        ? body.maxPagesPerMonth
        : typeof body.maxPages === "number"
          ? body.maxPages
          : 10;
    // Background sync avoids Vercel/proxy 504 while month batches run.
    res.json({
      success: true,
      data: startAmazonMarketplaceSync({
        monthsBack,
        maxPagesPerMonth,
        includeShipped: body.includeShipped ?? true,
        orderStatuses: body.orderStatuses
      })
    });
  } catch (err) {
    next(err);
  }
}

export async function flipkartConnection(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: getFlipkartConnectionStatus() });
  } catch (err) {
    next(err);
  }
}

export async function flipkartSyncAll(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await syncFlipkartMarketplace(req.body ?? {}) });
  } catch (err) {
    next(err);
  }
}

export async function etsyConnection(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: getEtsyConnectionStatus() });
  } catch (err) {
    next(err);
  }
}

export async function etsySyncAll(req: Request, res: Response, next: NextFunction) {
  try {
    const monthsBack = typeof req.body?.monthsBack === "number" ? req.body.monthsBack : 24;
    const maxPagesPerMonth =
      typeof req.body?.maxPagesPerMonth === "number" ? req.body.maxPagesPerMonth : 10;
    // Background sync avoids Vercel/proxy 504 while month batches run.
    res.json({
      success: true,
      data: startEtsyMarketplaceSync({ monthsBack, maxPagesPerMonth })
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/marketplaces/zoho-books/analytics — historical Zoho Books (isolated tables) */
export async function zohoBooksAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { getZohoHistoricalAnalytics } = await import("../zoho/zoho-historical-invoices.service");
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
    res.json({
      success: true,
      data: await getZohoHistoricalAnalytics({ from, to, channel }),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/marketplaces/zoho-books/channels */
export async function zohoBooksChannels(_req: Request, res: Response, next: NextFunction) {
  try {
    const { listZohoHistoricalChannels } = await import("../zoho/zoho-historical-invoices.service");
    res.json({ success: true, data: { channels: await listZohoHistoricalChannels() } });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/marketplaces/zoho-books/products */
export async function zohoBooksProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { listZohoHistoricalProducts } = await import("../zoho/zoho-historical-invoices.service");
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const sort =
      req.query.sort === "least_sold" || req.query.sort === "top_sold"
        ? req.query.sort
        : undefined;
    const limit =
      typeof req.query.limit === "string" && !Number.isNaN(Number(req.query.limit))
        ? Number(req.query.limit)
        : undefined;
    const offset =
      typeof req.query.offset === "string" && !Number.isNaN(Number(req.query.offset))
        ? Number(req.query.offset)
        : undefined;
    res.json({
      success: true,
      data: await listZohoHistoricalProducts({ from, to, channel, search, sort, limit, offset }),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/marketplaces/zoho-books/orders */
export async function zohoBooksOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const { listZohoHistoricalOrders } = await import("../zoho/zoho-historical-invoices.service");
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const country = typeof req.query.country === "string" ? req.query.country : undefined;
    const sort =
      req.query.sort === "lowest" || req.query.sort === "highest"
        ? req.query.sort
        : undefined;
    const limit =
      typeof req.query.limit === "string" && !Number.isNaN(Number(req.query.limit))
        ? Number(req.query.limit)
        : undefined;
    const offset =
      typeof req.query.offset === "string" && !Number.isNaN(Number(req.query.offset))
        ? Number(req.query.offset)
        : undefined;
    res.json({
      success: true,
      data: await listZohoHistoricalOrders({
        from,
        to,
        channel,
        search,
        city,
        state,
        country,
        sort,
        limit,
        offset,
      }),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/marketplaces/zoho-books/orders/:zohoInvoiceId */
export async function zohoBooksOrderDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { getZohoHistoricalOrderDetail } = await import("../zoho/zoho-historical-invoices.service");
    const data = await getZohoHistoricalOrderDetail(String(req.params.zohoInvoiceId || ""));
    if (!data) {
      res.status(404).json({ success: false, error: "Historical order not found" });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
