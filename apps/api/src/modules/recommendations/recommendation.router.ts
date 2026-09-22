import { Router } from 'express';
import * as controller from './recommendation.controller';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { authenticatedRateLimit } from '../../middleware/rate-limit';
import { recommendationsSchema } from './recommendation.validation';

const router = Router();

router.get(
  '/',
  requireAuth,
  authenticatedRateLimit,
  validate(recommendationsSchema),
  controller.getRecommendations,
);

export { router as recommendationRouter };
