import { and, asc, eq, gte, inArray, ne, sql, type SQL } from 'drizzle-orm';
import type { UserEventState } from '@the-drop/types';
import { db } from '../../db/client';
import { events } from '../../db/schema/events';
import { venues } from '../../db/schema/venues';
import { userEventStates } from '../../db/schema/user-event-states';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { decodeCursor, encodeCursor, parseLimit } from '../../utils/pagination';
import { fetchArtistsForEvents, type EventArtistSummary } from './event.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SetEventStateResult {
  eventId: string;
  state: UserEventState;
  updatedAt: Date;
}

export interface MyRavesOptions {
  states?: UserEventState[];
  upcoming?: boolean;
  cursor?: string;
  limit?: number;
}

export interface MyRaveEventSummary {
  id: string;
  title: string;
  slug: string;
  startsAt: Date;
  timezone: string;
  imageUrl: string | null;
  venue: { name: string; city: string } | null;
  artists: EventArtistSummary[];
}

export interface MyRaveItem {
  event: MyRaveEventSummary;
  state: UserEventState;
  updatedAt: Date;
}

export interface MyRavesResult {
  data: MyRaveItem[];
  cursor: string | null;
}

function decodeMyRavesCursor(cursor: string): { startsAt: string; id: string } {
  const { startsAt, id } = decodeCursor<{ startsAt?: unknown; id?: unknown }>(cursor);
  if (
    typeof startsAt !== 'string' ||
    Number.isNaN(Date.parse(startsAt)) ||
    typeof id !== 'string' ||
    !UUID_REGEX.test(id)
  ) {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }
  return { startsAt, id };
}

export async function setEventState(
  userId: string,
  eventId: string,
  state: UserEventState,
): Promise<SetEventStateResult> {
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.id, eventId), ne(events.status, 'DRAFT')))
    .limit(1);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  const [row] = await db
    .insert(userEventStates)
    .values({ userId, eventId, state })
    .onConflictDoUpdate({
      target: [userEventStates.userId, userEventStates.eventId],
      set: { state, updatedAt: new Date() },
    })
    .returning({
      eventId: userEventStates.eventId,
      state: userEventStates.state,
      updatedAt: userEventStates.updatedAt,
    });
  if (!row) {
    throw new Error('Failed to set event state');
  }

  return row;
}

export async function removeEventState(userId: string, eventId: string): Promise<void> {
  const deleted = await db
    .delete(userEventStates)
    .where(and(eq(userEventStates.userId, userId), eq(userEventStates.eventId, eventId)))
    .returning({ eventId: userEventStates.eventId });

  if (deleted.length === 0) {
    throw new NotFoundError('No state set for this event');
  }
}

export async function listMyRaves(userId: string, opts: MyRavesOptions): Promise<MyRavesResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeMyRavesCursor(opts.cursor) : undefined;

  const conditions: SQL[] = [
    eq(userEventStates.userId, userId),
    // A cancelled or postponed event stays visible so the user can see what happened to it.
    ne(events.status, 'DRAFT'),
  ];
  if (opts.states && opts.states.length > 0) {
    conditions.push(inArray(userEventStates.state, opts.states));
  }
  if (opts.upcoming !== false) {
    conditions.push(gte(events.startsAt, sql`now()`));
  }
  if (cursorData) {
    conditions.push(
      sql`(${events.startsAt}, ${events.id}) > (${cursorData.startsAt}::timestamptz, ${cursorData.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      eventId: events.id,
      title: events.title,
      slug: events.slug,
      startsAt: events.startsAt,
      timezone: events.timezone,
      imageUrl: events.imageUrl,
      venueName: venues.name,
      venueCity: venues.city,
      state: userEventStates.state,
      updatedAt: userEventStates.updatedAt,
    })
    .from(userEventStates)
    .innerJoin(events, eq(events.id, userEventStates.eventId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(and(...conditions))
    .orderBy(asc(events.startsAt), asc(events.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const artistsByEvent = await fetchArtistsForEvents(page.map((row) => row.eventId));

  const data: MyRaveItem[] = page.map((row) => ({
    event: {
      id: row.eventId,
      title: row.title,
      slug: row.slug,
      startsAt: row.startsAt,
      timezone: row.timezone,
      imageUrl: row.imageUrl,
      venue:
        row.venueName !== null && row.venueCity !== null
          ? { name: row.venueName, city: row.venueCity }
          : null,
      artists: artistsByEvent.get(row.eventId) ?? [],
    },
    state: row.state,
    updatedAt: row.updatedAt,
  }));

  const last = page[page.length - 1];
  const cursor =
    hasMore && last
      ? encodeCursor({ startsAt: last.startsAt.toISOString(), id: last.eventId })
      : null;

  return { data, cursor };
}
