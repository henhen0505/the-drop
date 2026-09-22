import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as venueService from './venue.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const listVenues = asyncHandler(async (req, res) => {
  const result = await venueService.listVenues({
    q: req.query.q as string | undefined,
    city: req.query.city as string | undefined,
    state: req.query.state as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    cursor: req.query.cursor as string | undefined,
  });
  res.json(result);
});

export const getVenue = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params as { idOrSlug: string };
  const detail = await venueService.getVenue(idOrSlug);
  res.json({ data: detail });
});
