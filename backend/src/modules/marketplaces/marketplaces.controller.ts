import type { NextFunction, Request, Response } from "express";

import { getAmazonConnectionStatus, syncAmazonMarketplace, syncAmazonOrders } from "./amazon/amazon-orders-sync";
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
    res.json({ success: true, data: await syncAmazonMarketplace(req.body ?? {}) });
  } catch (err) {
    next(err);
  }
}
