import { Router } from 'express';
import * as controller from './event.controller';
import * as stateController from './user-event-state.controller';
import * as similarController from './similar-events.controller';
import { validate } from '../../middleware/validate';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { authenticatedRateLimit } from '../../middleware/rate-limit';
import { listEventsSchema, getEventSchema } from './event.validation';
import { setEventStateSchema, removeEventStateSchema } from './user-event-state.validation';
import { similarEventsSchema } from './similar-events.validation';

const router = Router();

router.get('/', optionalAuth, validate(listEventsSchema), controller.listEvents);
router.get('/:idOrSlug', optionalAuth, validate(getEventSchema), controller.getEvent);
router.get(
  '/:id/similar',
  optionalAuth,
  validate(similarEventsSchema),
  similarController.getSimilarEvents,
);
router.put(
  '/:id/state',
  requireAuth,
  authenticatedRateLimit,
  validate(setEventStateSchema),
  stateController.setEventState,
);
router.delete(
  '/:id/state',
  requireAuth,
  authenticatedRateLimit,
  validate(removeEventStateSchema),
  stateController.removeEventState,
);

export { router as eventRouter };
