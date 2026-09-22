import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as ingestionService from './ingestion.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const ingestBySpotifyId = asyncHandler(async (req, res) => {
  const { spotifyId } = req.params as { spotifyId: string };
  const result = await ingestionService.ingestBySpotifyId(spotifyId);
  res.status(result.isNew ? 201 : 200).json({ data: result });
});

export const searchAndIngest = asyncHandler(async (req, res) => {
  const results = await ingestionService.searchAndIngest(req.body.query);
  res.json({ data: results });
});
