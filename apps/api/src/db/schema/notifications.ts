import { isNull } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { notificationTypeEnum } from './enums';
import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    data: jsonb('data'), // e.g. { "eventId": "...", "artistId": "..." }
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_notifications_user').on(table.userId, table.createdAt.desc()),
    index('idx_notifications_unread').on(table.userId).where(isNull(table.readAt)),
  ],
);

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  eventTomorrow: boolean('event_tomorrow').notNull().default(true),
  eventCancelled: boolean('event_cancelled').notNull().default(true),
  eventRescheduled: boolean('event_rescheduled').notNull().default(true),
  artistNewEvent: boolean('artist_new_event').notNull().default(true),
  submissionUpdates: boolean('submission_updates').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
