import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as searchService from './search.service';
import type { AutocompleteQuery, SearchQuery } from './search.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const search = asyncHandler(async (req, res) => {
  const query = req.query as unknown as SearchQuery;
  const data = await searchService.search({ q: query.q, types: query.type, limit: query.limit });
  res.json({ data });
});

export const autocomplete = asyncHandler(async (req, res) => {
  const query = req.query as unknown as AutocompleteQuery;
  const data = await searchService.autocomplete({ q: query.q, limit: query.limit });
  res.json({ data });
});
