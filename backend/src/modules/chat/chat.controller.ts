import type { NextFunction, Request, Response } from "express";

import { prisma } from "../../config/db";
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
    let name: string | null = null;
    let email: string | null = req.authUser?.email ?? null;

    if (req.authUser?.id) {
      const user = await prisma.user.findUnique({
        where: { id: req.authUser.id },
        select: { name: true, email: true }
      });
      name = user?.name ?? null;
      email = user?.email ?? email;
    }

    const data = await runChat(body, { name, email });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
