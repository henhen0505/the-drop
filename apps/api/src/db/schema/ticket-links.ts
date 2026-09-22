import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sourceTypeEnum, vendorClassificationEnum } from './enums';
import { events } from './events';

export const ticketLinks = pgTable(
  'ticket_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    vendorName: text('vendor_name').notNull(), // "Ticketmaster", "SeatGeek", etc.
    vendorClassification: vendorClassificationEnum('vendor_classification')
      .notNull()
      .default('OFFICIAL'),
    url: text('url').notNull(), // Direct vendor URL
    affiliateUrl: text('affiliate_url'), // Affiliate-tagged URL for revenue
    priceMinCents: integer('price_min_cents'), // Lowest known price in cents
    priceMaxCents: integer('price_max_cents'),
    currency: text('currency').notNull().default('USD'),
    ticketType: text('ticket_type'), // "GA", "VIP", "Early Bird"
    feesKnown: boolean('fees_known').notNull().default(false),
    // FTC disclosure required on all affiliate links (enforced in API layer)
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    sourceType: sourceTypeEnum('source_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_ticket_links_event').on(table.eventId)],
);
