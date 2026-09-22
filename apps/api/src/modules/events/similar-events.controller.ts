import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as similarEventsService from './similar-events.service';
import type { SimilarEventsQuery } from './similar-events.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const getSimilarEvents = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const query = req.query as unknown as SimilarEventsQuery;
  const data = await similarEventsService.getSimilarEvents(id, {
    limit: query.limit,
    userId: req.user?.id,
  });
  res.json({ data });
});
