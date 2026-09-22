import { Router } from 'express';
import * as controller from './artist.controller';
import * as eventController from '../events/event.controller';
import * as ingestionController from './ingestion.controller';
import { validate } from '../../middleware/validate';
import { requireAuth, optionalAuth } from '../../middleware/auth';
import { authenticatedRateLimit } from '../../middleware/rate-limit';
import { requireRole } from '../../middleware/require-role';
import {
  listArtistsSchema,
  getArtistSchema,
  artistIdParamSchema,
} from './artist.validation';
import {
  ingestBySpotifyIdSchema,
  searchAndIngestSchema,
} from './ingestion.validation';
import { eventsByArtistSchema } from '../events/event.validation';

const router = Router();

router.get('/', optionalAuth, validate(listArtistsSchema), controller.listArtists);
router.get('/:idOrSlug', optionalAuth, validate(getArtistSchema), controller.getArtist);
router.get(
  '/:idOrSlug/events',
  optionalAuth,
  validate(eventsByArtistSchema),
  eventController.getEventsByArtist,
);
router.post(
  '/:id/follow',
  requireAuth,
  authenticatedRateLimit,
  validate(artistIdParamSchema),
  controller.followArtist,
);
router.delete(
  '/:id/follow',
  requireAuth,
  authenticatedRateLimit,
  validate(artistIdParamSchema),
  controller.unfollowArtist,
);

// Admin-only ingestion endpoints
router.post(
  '/ingest/spotify/:spotifyId',
  requireAuth,
  requireRole('ADMIN'),
  authenticatedRateLimit,
  validate(ingestBySpotifyIdSchema),
  ingestionController.ingestBySpotifyId,
);
router.post(
  '/ingest/search',
  requireAuth,
  requireRole('ADMIN'),
  authenticatedRateLimit,
  validate(searchAndIngestSchema),
  ingestionController.searchAndIngest,
);

export { router as artistRouter };
