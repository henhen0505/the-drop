import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/require-role';
import { validate } from '../../middleware/validate';
import { triggerSyncSchema } from './sync.validation';
import * as syncController from './sync.controller';

export const syncRouter = Router();

syncRouter.use(requireAuth, requireRole('ADMIN'));

syncRouter.get('/sync-status', syncController.getSyncStatus);
syncRouter.post('/sync/trigger', validate(triggerSyncSchema), syncController.triggerSync);
