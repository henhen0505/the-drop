import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as recommendationService from './recommendation.service';
import type { RecommendationsQuery } from './recommendation.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const getRecommendations = asyncHandler(async (req, res) => {
  const query = req.query as unknown as RecommendationsQuery;
  const result = await recommendationService.getRecommendations(req.user!.id, {
    limit: query.limit,
    cursor: query.cursor,
  });
  res.json(result);
});
