import { Router } from 'express';
import * as controller from './user.controller';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authenticatedRateLimit } from '../../middleware/rate-limit';
import {
  updateProfileSchema,
  setGenrePreferencesSchema,
  updateNotificationPrefsSchema,
} from './user.validation';
import { followedArtistsQuerySchema } from '../artists/artist.validation';
import * as stateController from '../events/user-event-state.controller';
import { myRavesSchema } from '../events/user-event-state.validation';
import * as submissionController from '../submissions/submission.controller';
import { mySubmissionsSchema } from '../submissions/submission.validation';

const router = Router();

router.use(requireAuth);
router.use(authenticatedRateLimit);

router.get('/me', controller.getProfile);
router.patch('/me', validate(updateProfileSchema), controller.updateProfile);
router.get('/me/genre-preferences', controller.getGenrePreferences);
router.put(
  '/me/genre-preferences',
  validate(setGenrePreferencesSchema),
  controller.setGenrePreferences,
);
router.get('/me/notification-preferences', controller.getNotificationPreferences);
router.patch(
  '/me/notification-preferences',
  validate(updateNotificationPrefsSchema),
  controller.updateNotificationPreferences,
);
router.get(
  '/me/followed-artists',
  validate(followedArtistsQuerySchema),
  controller.getFollowedArtists,
);
router.get('/me/raves', validate(myRavesSchema), stateController.listMyRaves);
router.get(
  '/me/submissions',
  validate(mySubmissionsSchema),
  submissionController.listMySubmissions,
);

export { router as userRouter };
