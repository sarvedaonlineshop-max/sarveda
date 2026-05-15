import type { NextFunction, Request, Response } from "express";

import { getChatStatus, runChat } from "./chat.service";
import type { ChatRequestBody } from "./chat.schemas";

export function status(_req: Request, res: Response) {
  res.json({
    success: true,
    data: getChatStatus()
  });
}

export async function postMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as ChatRequestBody;
    const data = await runChat(body, {
      email: req.authUser?.email
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
