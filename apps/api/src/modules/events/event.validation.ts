import { z } from 'zod';

/**
 * A raw "+" in a query string decodes to a space, so "?ageRestriction=21+"
 * arrives as "21 ". Trim it and restore the "+" a trailing space stood for.
 */
export function normalizeAgeRestriction(raw: string): string {
  const trimmed = raw.trim();
  return trimmed !== '' && raw.endsWith(' ') ? `${trimmed}+` : trimmed;
}

export const listEventsSchema = {
  query: z.object({
    q: z.string().optional(),
    city: z.string().optional(),
    state: z.string().max(2).optional(),
    startsAfter: z.coerce.date().optional(),
    startsBefore: z.coerce.date().optional(),
    genreId: z.string().uuid().optional(),
    venueId: z.string().uuid().optional(),
    ageRestriction: z.string().transform(normalizeAgeRestriction).pipe(z.string().min(1)).optional(),
    priceMin: z.coerce.number().int().min(0).optional(),
    priceMax: z.coerce.number().int().min(0).optional(),
    status: z.enum(['PUBLISHED', 'CANCELLED', 'POSTPONED', 'COMPLETED']).optional(),
    sort: z.enum(['date', 'relevance', 'price']).default('date'),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export type ListEventsQuery = z.infer<typeof listEventsSchema.query>;

export const getEventSchema = {
  params: z.object({
    idOrSlug: z.string().min(1),
  }),
};

export const eventsByArtistSchema = {
  params: z.object({
    idOrSlug: z.string().min(1),
  }),
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};
