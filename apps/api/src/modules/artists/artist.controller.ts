import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as artistService from './artist.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const listArtists = asyncHandler(async (req, res) => {
  const result = await artistService.listArtists({
    q: req.query.q as string | undefined,
    genre: req.query.genre as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    cursor: req.query.cursor as string | undefined,
    userId: req.user?.id,
  });
  res.json(result);
});

export const getArtist = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params as { idOrSlug: string };
  const detail = await artistService.getArtist(idOrSlug, req.user?.id);
  res.json({ data: detail });
});

export const followArtist = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const result = await artistService.followArtist(req.user!.id, id);
  res.status(201).json({ data: result });
});

export const unfollowArtist = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  await artistService.unfollowArtist(req.user!.id, id);
  res.status(204).send();
});
