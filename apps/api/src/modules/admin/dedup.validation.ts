import { z } from 'zod';
import { DEDUP_MATCH_STATUSES } from '@the-drop/types';

export const listCandidatesSchema = {
  query: z.object({
    status: z.enum(DEDUP_MATCH_STATUSES).default('PENDING_REVIEW'),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export const resolveCandidateSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    action: z.enum(['merge', 'reject']),
  }),
};
