import { z } from 'zod';

export const listVenuesSchema = {
  query: z.object({
    q: z.string().optional(),
    city: z.string().optional(),
    state: z.string().max(2).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export const getVenueSchema = {
  params: z.object({
    idOrSlug: z.string().min(1),
  }),
};

export const eventsByVenueSchema = {
  params: z.object({
    idOrSlug: z.string().min(1),
  }),
  query: z.object({
    upcoming: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};
