import { eq, sql } from 'drizzle-orm';
import { index, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { dedupMatchStatusEnum } from './enums';
import { events } from './events';
import { incomingEvents } from './event-sources';
import { users } from './users';

/**
 * Dedup engine output for admin review (architecture/decisions.md #7).
 * One row per (incoming record, existing canonical event) candidate pair
 * that scored in the REVIEW band.
 */
export const eventMatchCandidates = pgTable(
  'event_match_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    // The incoming source record (from the staging table)
    incomingEventId: uuid('incoming_event_id').references(() => incomingEvents.id, {
      onDelete: 'set null',
    }),
    incomingTitle: text('incoming_title').notNull(),
    incomingDate: timestamp('incoming_date', { withTimezone: true }).notNull(),
    incomingVenueName: text('incoming_venue_name'),
    incomingArtists: text('incoming_artists').array(), // Normalized artist names from source

    // The existing canonical event it might match
    candidateEventId: uuid('candidate_event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),

    // Scoring
    score: real('score').notNull(), // 0.0 to 1.0 weighted composite
    venueScore: real('venue_score'),
    dateScore: real('date_score'),
    titleScore: real('title_score'),
    artistScore: real('artist_score'),
    matchDetails: jsonb('match_details'), // Full breakdown for admin review

    // Resolution
    status: dedupMatchStatusEnum('status').notNull().default('PENDING_REVIEW'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_match_candidates_status')
      .on(table.status)
      .where(eq(table.status, sql`'PENDING_REVIEW'`)),
    index('idx_match_candidates_event').on(table.candidateEventId),
  ],
);
