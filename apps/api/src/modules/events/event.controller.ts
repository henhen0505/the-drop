import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as eventService from './event.service';
import type { ListEventsQuery } from './event.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const listEvents = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListEventsQuery;
  const result = await eventService.listEvents({ ...query, userId: req.user?.id });
  res.json(result);
});

export const getEvent = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params as { idOrSlug: string };
  const detail = await eventService.getEvent(idOrSlug, req.user?.id);
  res.json({ data: detail });
});

export const getEventsByArtist = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params as { idOrSlug: string };
  const result = await eventService.getEventsByArtist(idOrSlug, {
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    cursor: req.query.cursor as string | undefined,
    userId: req.user?.id,
  });
  res.json(result);
});

export const getEventsByVenue = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params as { idOrSlug: string };
  const result = await eventService.getEventsByVenue(idOrSlug, {
    upcoming: req.query.upcoming as unknown as boolean | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    cursor: req.query.cursor as string | undefined,
    userId: req.user?.id,
  });
  res.json(result);
});
