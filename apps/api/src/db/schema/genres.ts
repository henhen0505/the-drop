import { index, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Hierarchical genre taxonomy (parentId for subgenres), e.g. "Deep House"
 * -> parent "House". Seeded from Last.fm tags + manual curation (Sprint 1).
 */
export const genres = pgTable(
  'genres',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
    parentId: uuid('parent_id').references((): AnyPgColumn => genres.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_genres_parent').on(table.parentId),
    index('idx_genres_slug').on(table.slug),
  ],
);
