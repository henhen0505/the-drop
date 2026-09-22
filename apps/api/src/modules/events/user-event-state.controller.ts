import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserEventState } from '@the-drop/types';
import * as stateService from './user-event-state.service';
import type { MyRavesQuery } from './user-event-state.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const setEventState = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const { state } = req.body as { state: UserEventState };
  const result = await stateService.setEventState(req.user!.id, id, state);
  res.json({ data: result });
});

export const removeEventState = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  await stateService.removeEventState(req.user!.id, id);
  res.status(204).send();
});

export const listMyRaves = asyncHandler(async (req, res) => {
  const query = req.query as unknown as MyRavesQuery;
  const result = await stateService.listMyRaves(req.user!.id, {
    states: query.state,
    upcoming: query.upcoming,
    limit: query.limit,
    cursor: query.cursor,
  });
  res.json(result);
});
