import { z } from 'zod';

const searchTypeEnum = z.enum(['event', 'artist', 'venue']);

export type SearchEntityType = z.infer<typeof searchTypeEnum>;

const ALL_SEARCH_TYPES: SearchEntityType[] = ['event', 'artist', 'venue'];

export const searchSchema = {
  query: z.object({
    q: z.string().min(2),
    type: z
      .string()
      .optional()
      .transform((raw) => (raw ? raw.split(',') : ALL_SEARCH_TYPES))
      .pipe(z.array(searchTypeEnum).min(1)),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

export type SearchQuery = z.infer<typeof searchSchema.query>;

export const autocompleteSchema = {
  query: z.object({
    q: z.string().min(2),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
};

export type AutocompleteQuery = z.infer<typeof autocompleteSchema.query>;
