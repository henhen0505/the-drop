import { isNotNull, sql } from 'drizzle-orm';
import {
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { confidenceLevelEnum, sourceTypeEnum } from './enums';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const venues = pgTable(
  'venues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    address: text('address'),
    city: text('city').notNull(),
    state: text('state'),
    country: text('country').notNull().default('US'),
    postalCode: text('postal_code'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    timezone: text('timezone'), // IANA timezone, derived from coordinates or manually set
    capacity: integer('capacity'),
    venueType: text('venue_type'), // "club", "arena", "outdoor", "warehouse"
    imageUrl: text('image_url'),
    typicalAgeRestriction: text('typical_age_restriction'), // "21+", "18+", "all ages"
    typicalBagPolicy: text('typical_bag_policy'),

    // External IDs for dedup matching
    ticketmasterId: text('ticketmaster_id').unique(),
    seatgeekId: text('seatgeek_id').unique(),

    // Provenance
    primarySource: sourceTypeEnum('primary_source').notNull().default('ADMIN'),
    sourceUrl: text('source_url'),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    confidence: confidenceLevelEnum('confidence').notNull().default('UNVERIFIED'),
    fieldProvenance: jsonb('field_provenance').notNull().default({}),

    // Full-text search
    searchVector: tsvector('search_vector'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_venues_slug').on(table.slug),
    index('idx_venues_city').on(table.city),
    index('idx_venues_tm').on(table.ticketmasterId).where(isNotNull(table.ticketmasterId)),
    index('idx_venues_sg').on(table.seatgeekId).where(isNotNull(table.seatgeekId)),
    index('idx_venues_search').using('gin', table.searchVector),
    index('idx_venues_name_trgm').using('gin', sql`${table.name} gin_trgm_ops`),
    index('idx_venues_coords').on(table.latitude, table.longitude).where(isNotNull(table.latitude)),
  ],
);
