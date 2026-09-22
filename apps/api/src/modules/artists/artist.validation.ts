import { z } from 'zod';

export const listArtistsSchema = {
  query: z.object({
    q: z.string().optional(),
    genre: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export const getArtistSchema = {
  params: z.object({
    idOrSlug: z.string().min(1),
  }),
};

export const artistIdParamSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const followedArtistsQuerySchema = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};
