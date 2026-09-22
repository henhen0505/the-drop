import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/require-role';
import { validate } from '../../middleware/validate';
import { listCandidatesSchema, resolveCandidateSchema } from './dedup.validation';
import * as dedupController from './dedup.controller';

export const dedupRouter = Router();

dedupRouter.use(requireAuth, requireRole('ADMIN'));

dedupRouter.get('/candidates', validate(listCandidatesSchema), dedupController.listCandidates);
dedupRouter.patch(
  '/candidates/:id',
  validate(resolveCandidateSchema),
  dedupController.resolveCandidate,
);
