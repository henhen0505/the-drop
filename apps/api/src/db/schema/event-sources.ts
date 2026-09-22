import { eq, sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sourceTypeEnum } from './enums';
import { events } from './events';

/**
 * Every Ticketmaster listing, SeatGeek listing, or community submission
 * that maps to a canonical event gets a row here. raw_data stores the
 * original API response for reprocessing.
 */
export const eventSources = pgTable(
  'event_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    sourceType: sourceTypeEnum('source_type').notNull(),
    externalId: text('external_id'), // Ticketmaster event ID, SeatGeek ID, etc.
    sourceUrl: text('source_url'),
    rawData: jsonb('raw_data'), // Full API response for reprocessing
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_event_source').on(table.sourceType, table.externalId),
    index('idx_event_sources_event').on(table.eventId),
    index('idx_event_sources_external').on(table.sourceType, table.externalId),
  ],
);

/**
 * Dedup staging table -- decouples ingestion from the dedup decision.
 * Pipeline: API adapter -> incoming_events -> normalizer -> dedup scorer
 * -> decision -> either merge into existing event_sources or create a
 * new canonical event.
 */
export const incomingEvents = pgTable(
  'incoming_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceType: sourceTypeEnum('source_type').notNull(),
    externalId: text('external_id'),
    rawData: jsonb('raw_data').notNull(),
    normalizedData: jsonb('normalized_data'), // Output of the normalizer
    status: text('status').notNull().default('PENDING'), // PENDING, PROCESSED, FAILED
    matchedEventId: uuid('matched_event_id').references(() => events.id), // Set after dedup decision
    matchScore: real('match_score'),
    matchDecision: text('match_decision'), // AUTO_MERGE, REVIEW, NO_MATCH (null if pending)
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_incoming_status')
      .on(table.status)
      .where(eq(table.status, sql`'PENDING'`)),
  ],
);

/**
 * Denormalized from event_sources for O(1) dedup lookups
 * ("does TM event abc123 already exist?").
 */
export const eventExternalIds = pgTable(
  'event_external_ids',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    sourceType: sourceTypeEnum('source_type').notNull(),
    externalId: text('external_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceType, table.externalId] }),
    index('idx_event_external_ids_event').on(table.eventId),
  ],
);
