import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as submissionService from './submission.service';
import type { CreateSubmissionInput, MySubmissionsQuery } from './submission.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const createSubmission = asyncHandler(async (req, res) => {
  const result = await submissionService.createSubmission(
    { id: req.user!.id, role: req.user!.role },
    req.body as CreateSubmissionInput,
  );
  res.status(201).json({ data: result });
});

export const listMySubmissions = asyncHandler(async (req, res) => {
  const query = req.query as unknown as MySubmissionsQuery;
  const result = await submissionService.listMySubmissions(req.user!.id, {
    status: query.status,
    limit: query.limit,
    cursor: query.cursor,
  });
  res.json(result);
});
