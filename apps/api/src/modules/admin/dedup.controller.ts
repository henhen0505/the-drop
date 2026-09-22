import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { DedupMatchStatus } from '@the-drop/types';
import * as dedupService from './dedup.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const listCandidates = asyncHandler(async (req, res) => {
  const result = await dedupService.listCandidates({
    status: req.query.status as DedupMatchStatus | undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    cursor: req.query.cursor as string | undefined,
  });
  res.json(result);
});

export const resolveCandidate = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const { action } = req.body as { action: 'merge' | 'reject' };
  const data = await dedupService.resolveCandidate(id, action, req.user!.id);
  res.json({ data });
});
