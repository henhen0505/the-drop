import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { confidenceLevelEnum, eventStatusEnum, sourceTypeEnum } from './enums';
import { venues } from './venues';
import { artists } from './artists';
import { genres } from './genres';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/**
 * Canonical events -- one row per real-world event, regardless of how many
 * sources list it. Raw source records live in event_sources.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    imageUrl: text('image_url'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(), // Canonical start (UTC)
    endsAt: timestamp('ends_at', { withTimezone: true }), // Canonical end (UTC), nullable
    timezone: text('timezone').notNull().default('America/New_York'), // IANA timezone for display
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    status: eventStatusEnum('status').notNull().default('PUBLISHED'),

    // Curated fields (not available from APIs)
    ageRestriction: text('age_restriction'), // "21+", "18+", "all ages"
    doorTime: time('door_time'), // Local time at the venue; interpret using event timezone
    reentryPolicy: text('reentry_policy'),
    bagPolicy: text('bag_policy'),
    prohibitedItems: text('prohibited_items'),
    dressCode: text('dress_code'),

    // Provenance (entity-level: which source created this canonical event)
    primarySource: sourceTypeEnum('primary_source').notNull().default('ADMIN'),
    sourceUrl: text('source_url'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    confidence: confidenceLevelEnum('confidence').notNull().default('UNVERIFIED'),
    fieldProvenance: jsonb('field_provenance').notNull().default({}),

    // Full-text search
    searchVector: tsvector('search_vector'),

    // Denormalized for sort/filter (updated by background jobs)
    minPriceCents: integer('min_price_cents'), // Lowest known ticket price
    artistCount: integer('artist_count').notNull().default(0),
    staleFlaggedAt: timestamp('stale_flagged_at', { withTimezone: true }), // Set/cleared by the stale-detection job (Sprint 7)

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_events_slug').on(table.slug),
    index('idx_events_starts_at').on(table.startsAt),
    index('idx_events_status').on(table.status),
    index('idx_events_venue').on(table.venueId),
    index('idx_events_search').using('gin', table.searchVector),
    index('idx_events_title_trgm').using('gin', sql`${table.title} gin_trgm_ops`),
    // Composite index for discovery queries. No partial-index WHERE clause:
    // CURRENT_DATE is not immutable, so Postgres rejects it in a partial
    // index. Filter for upcoming events at query time instead.
    index('idx_events_discovery').on(table.startsAt, table.status),
  ],
);

export const eventArtists = pgTable(
  'event_artists',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    isHeadliner: boolean('is_headliner').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.artistId] }),
    index('idx_event_artists_artist').on(table.artistId),
  ],
);

export const eventGenres = pgTable(
  'event_genres',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.genreId] }),
    index('idx_event_genres_genre').on(table.genreId),
  ],
);
