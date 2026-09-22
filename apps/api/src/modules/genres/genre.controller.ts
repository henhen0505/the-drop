import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as genreService from './genre.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const listGenres = asyncHandler(async (_req, res) => {
  const data = await genreService.listGenreTree();
  res.json({ data });
});
