import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './notification.controller';
import { listNotificationsSchema, markReadSchema } from './notification.validation';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

notificationRouter.get('/', validate(listNotificationsSchema), controller.list);
notificationRouter.patch('/:id/read', validate(markReadSchema), controller.markRead);
notificationRouter.post('/read-all', controller.markAllRead);
