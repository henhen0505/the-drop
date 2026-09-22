import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { userEventStateEnum } from './enums';
import { users } from './users';
import { events } from './events';
import { artists } from './artists';
import { genres } from './genres';

export const userEventStates = pgTable(
  'user_event_states',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    state: userEventStateEnum('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.eventId] }),
    index('idx_user_event_states_user').on(table.userId),
    index('idx_user_event_states_event').on(table.eventId),
    // Fast query for "My Raves" dashboard: upcoming active states
    index('idx_user_event_states_active')
      .on(table.userId, table.state)
      .where(sql`${table.state} in ('INTERESTED', 'GOING', 'HAVE_TICKET')`),
  ],
);

export const userArtistFollows = pgTable(
  'user_artist_follows',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.artistId] }),
    index('idx_user_artist_follows_artist').on(table.artistId),
  ],
);

export const userGenrePreferences = pgTable(
  'user_genre_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.genreId] })],
);
