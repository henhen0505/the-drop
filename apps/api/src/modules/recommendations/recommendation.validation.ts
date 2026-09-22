import { z } from 'zod';

export const recommendationsSchema = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export type RecommendationsQuery = z.infer<typeof recommendationsSchema.query>;
