import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isTicketmasterConfigured } from '../../integrations/ticketmaster';
import { logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';
import * as syncService from './sync.service';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const triggerSync = asyncHandler(async (_req, res) => {
  if (!isTicketmasterConfigured()) {
    throw new ValidationError('Ticketmaster is not configured');
  }

  // Fire-and-forget: a multi-minute sync must not hold the HTTP request open. Errors are logged
  // here for visibility; sync.service.ts already records the outcome in sync_status regardless.
  syncService.syncTicketmaster().catch((err) => {
    logger.error({ err }, 'Ticketmaster sync failed');
  });

  res.status(202).json({ data: { message: 'Sync job triggered.' } });
});

export const getSyncStatus = asyncHandler(async (_req, res) => {
  const data = await syncService.getSyncStatus();
  res.json({ data });
});
