import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/require-role';
import { validate } from '../../middleware/validate';
import * as controller from './admin-event.controller';
import {
  createAdminEventSchema,
  deleteAdminEventSchema,
  listAdminEventsSchema,
  mergeEventsSchema,
  updateAdminEventSchema,
} from './admin-event.validation';

export const adminEventRouter = Router();

adminEventRouter.use(requireAuth, requireRole('ADMIN'));

adminEventRouter.get('/', validate(listAdminEventsSchema), controller.listEvents);
adminEventRouter.post('/', validate(createAdminEventSchema), controller.createEvent);
// Registered before the /:id routes; it is a different method and path shape, so there is no overlap.
adminEventRouter.post('/merge', validate(mergeEventsSchema), controller.mergeEvents);
adminEventRouter.patch('/:id', validate(updateAdminEventSchema), controller.updateEvent);
adminEventRouter.delete('/:id', validate(deleteAdminEventSchema), controller.deleteEvent);
