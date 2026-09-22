import { eq, sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { submissionStatusEnum } from './enums';
import { users } from './users';
import { venues } from './venues';
import { events } from './events';

/**
 * Community-submitted events, prior to review/conversion into a
 * canonical event (unstructured -- may not match existing entities).
 */
export const communitySubmissions = pgTable(
  'community_submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    submitterId: uuid('submitter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Submitted event data
    eventTitle: text('event_title').notNull(),
    eventStartsAt: timestamp('event_starts_at', { withTimezone: true }).notNull(),
    venueId: uuid('venue_id').references(() => venues.id), // NULL if new venue
    venueNameRaw: text('venue_name_raw'), // Free text if venue not in DB
    venueAddressRaw: text('venue_address_raw'),
    artistNames: text('artist_names').array().notNull().default([]), // Free text artist names
    description: text('description'),
    posterImageUrl: text('poster_image_url'),
    ticketUrl: text('ticket_url'),
    sourceUrl: text('source_url'), // Where the submitter found this
    ageRestriction: text('age_restriction'),

    // Review workflow
    status: submissionStatusEnum('status').notNull().default('PENDING'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    mergedEventId: uuid('merged_event_id').references(() => events.id), // Set if MERGED

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_submissions_status')
      .on(table.status)
      .where(eq(table.status, sql`'PENDING'`)),
    index('idx_submissions_submitter').on(table.submitterId),
  ],
);
