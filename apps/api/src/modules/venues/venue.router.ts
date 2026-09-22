import { Router } from 'express';
import * as controller from './venue.controller';
import * as eventController from '../events/event.controller';
import { validate } from '../../middleware/validate';
import { optionalAuth } from '../../middleware/auth';
import { listVenuesSchema, getVenueSchema, eventsByVenueSchema } from './venue.validation';

const router = Router();

router.get('/', optionalAuth, validate(listVenuesSchema), controller.listVenues);
router.get('/:idOrSlug', optionalAuth, validate(getVenueSchema), controller.getVenue);
router.get(
  '/:idOrSlug/events',
  optionalAuth,
  validate(eventsByVenueSchema),
  eventController.getEventsByVenue,
);

export { router as venueRouter };
