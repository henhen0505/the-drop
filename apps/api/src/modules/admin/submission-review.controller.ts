import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as reviewService from './submission-review.service';
import type { ListSubmissionsQuery, ReviewSubmissionInput } from './submission-review.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const listSubmissions = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListSubmissionsQuery;
  const result = await reviewService.listSubmissions({
    status: query.status,
    limit: query.limit,
    cursor: query.cursor,
  });
  res.json(result);
});

export const reviewSubmission = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const data = await reviewService.reviewSubmission(id, req.user!.id, req.body as ReviewSubmissionInput);
  res.json({ data });
});
