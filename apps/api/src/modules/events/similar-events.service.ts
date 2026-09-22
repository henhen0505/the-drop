import { and, asc, desc, eq, gte, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client';
import { events, eventArtists, eventGenres } from '../../db/schema/events';
import { venues } from '../../db/schema/venues';
import { NotFoundError } from '../../utils/errors';
import {
  eventListColumns,
  fetchArtistsForEvents,
  fetchGenresForEvents,
  fetchUserStates,
  toEventListItem,
  type EventListItem,
} from './event.service';

const DEFAULT_SIMILAR_LIMIT = 10;

// A shared artist is a much stronger similarity signal than a shared genre.
const SHARED_ARTIST_WEIGHT = 2;
const SHARED_GENRE_WEIGHT = 1;

export interface SimilarEventsOptions {
  limit?: number;
  userId?: string;
}

export async function getSimilarEvents(
  eventId: string,
  opts: SimilarEventsOptions,
): Promise<EventListItem[]> {
  const [target] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), ne(events.status, 'DRAFT')))
    .limit(1);
  if (!target) {
    throw new NotFoundError('Event not found');
  }

  const [artistRows, genreRows] = await Promise.all([
    db
      .select({ artistId: eventArtists.artistId })
      .from(eventArtists)
      .where(eq(eventArtists.eventId, eventId)),
    db
      .select({ genreId: eventGenres.genreId })
      .from(eventGenres)
      .where(eq(eventGenres.eventId, eventId)),
  ]);
  const artistIds = artistRows.map((row) => row.artistId);
  const genreIds = genreRows.map((row) => row.genreId);

  // Nothing to overlap with. Also keeps inArray() from ever receiving an empty list.
  if (artistIds.length === 0 && genreIds.length === 0) {
    return [];
  }

  const sharedArtists: SQL<number> =
    artistIds.length > 0
      ? sql<number>`(select count(*)::int from ${eventArtists} where ${eventArtists.eventId} = ${events.id} and ${inArray(eventArtists.artistId, artistIds)})`
      : sql<number>`0`;
  const sharedGenres: SQL<number> =
    genreIds.length > 0
      ? sql<number>`(select count(*)::int from ${eventGenres} where ${eventGenres.eventId} = ${events.id} and ${inArray(eventGenres.genreId, genreIds)})`
      : sql<number>`0`;
  const overlap = sql<number>`(${sharedArtists} * ${SHARED_ARTIST_WEIGHT} + ${sharedGenres} * ${SHARED_GENRE_WEIGHT})`;

  const rows = await db
    .select({ ...eventListColumns, overlap })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(
      and(
        eq(events.status, 'PUBLISHED'),
        gte(events.startsAt, sql`now()`),
        ne(events.id, eventId),
        sql`${overlap} > 0`,
      ),
    )
    .orderBy(desc(overlap), asc(events.startsAt), asc(events.id))
    .limit(opts.limit ?? DEFAULT_SIMILAR_LIMIT);

  const eventIds = rows.map((row) => row.id);
  const [artistsByEvent, genresByEvent, statesByEvent] = await Promise.all([
    fetchArtistsForEvents(eventIds),
    fetchGenresForEvents(eventIds),
    fetchUserStates(opts.userId, eventIds),
  ]);

  return rows.map((row) =>
    toEventListItem(
      row,
      artistsByEvent.get(row.id),
      genresByEvent.get(row.id),
      statesByEvent.get(row.id),
    ),
  );
}
