import type { NextFunction, Request, RequestHandler, Response } from 'express';
import * as adminEventService from './admin-event.service';
import * as eventMergeService from './event-merge.service';
import type {
  CreateAdminEventInput,
  ListAdminEventsQuery,
  MergeEventsInput,
  UpdateAdminEventInput,
} from './admin-event.validation';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const listEvents = asyncHandler(async (req, res) => {
  const query = req.query as unknown as ListAdminEventsQuery;
  const result = await adminEventService.listAdminEvents({
    q: query.q,
    status: query.status,
    stale: query.stale,
    limit: query.limit,
    cursor: query.cursor,
  });
  res.json(result);
});

export const createEvent = asyncHandler(async (req, res) => {
  const data = await adminEventService.createAdminEvent(
    req.user!.id,
    req.body as CreateAdminEventInput,
  );
  res.status(201).json({ data });
});

export const updateEvent = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  const data = await adminEventService.updateAdminEvent(
    req.user!.id,
    id,
    req.body as UpdateAdminEventInput,
  );
  res.json({ data });
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const { id } = req.params as { id: string };
  await adminEventService.deleteAdminEvent(req.user!.id, id);
  res.status(204).send();
});

export const mergeEvents = asyncHandler(async (req, res) => {
  const data = await eventMergeService.mergeEvents(req.user!.id, req.body as MergeEventsInput);
  res.json({ data });
});
