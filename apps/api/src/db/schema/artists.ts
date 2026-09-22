import { isNotNull, sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { confidenceLevelEnum, sourceTypeEnum } from './enums';
import { genres } from './genres';

/**
 * Postgres tsvector column. Drizzle has no built-in tsvector type; the
 * value is populated exclusively by the `*_search_vector_update` trigger
 * functions (see migrations), never written from application code.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const artists = pgTable(
  'artists',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    imageUrl: text('image_url'),
    bio: text('bio'),

    // External IDs (nullable -- not every artist exists on every platform)
    spotifyId: text('spotify_id').unique(),
    lastfmId: text('lastfm_id'), // Last.fm uses artist name as ID
    musicbrainzId: uuid('musicbrainz_id').unique(),

    // External links
    spotifyUrl: text('spotify_url'),
    soundcloudUrl: text('soundcloud_url'),
    appleMusicUrl: text('apple_music_url'),

    // Provenance
    primarySource: sourceTypeEnum('primary_source').notNull().default('ADMIN'),
    sourceUrl: text('source_url'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    confidence: confidenceLevelEnum('confidence').notNull().default('UNVERIFIED'),
    fieldProvenance: jsonb('field_provenance').notNull().default({}),

    // Full-text search
    searchVector: tsvector('search_vector'),

    followerCount: integer('follower_count').notNull().default(0), // Denormalized for sort
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_artists_slug').on(table.slug),
    index('idx_artists_spotify').on(table.spotifyId).where(isNotNull(table.spotifyId)),
    index('idx_artists_musicbrainz').on(table.musicbrainzId).where(isNotNull(table.musicbrainzId)),
    index('idx_artists_search').using('gin', table.searchVector),
    index('idx_artists_name_trgm').using('gin', sql`${table.name} gin_trgm_ops`),
  ],
);

export const artistGenres = pgTable(
  'artist_genres',
  {
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.artistId, table.genreId] }),
    index('idx_artist_genres_genre').on(table.genreId),
  ],
);
