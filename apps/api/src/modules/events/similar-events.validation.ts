import { z } from 'zod';

export const similarEventsSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
};

export type SimilarEventsQuery = z.infer<typeof similarEventsSchema.query>;
