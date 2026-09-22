import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as notificationService from './notification.service';
import type { ListNotificationsQuery } from './notification.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const list = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListNotificationsQuery;
  const result = await notificationService.listNotifications(req.user!.id, {
    unreadOnly: query.unreadOnly,
    limit: query.limit,
    cursor: query.cursor,
  });
  res.json(result);
});

export const markRead = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const data = await notificationService.markRead(req.user!.id, id);
  res.json({ data });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markAllRead(req.user!.id);
  res.json({ data });
});
