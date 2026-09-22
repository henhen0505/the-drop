import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { artists } from '../db/schema/artists';
import { eventSources } from '../db/schema/event-sources';
import { eventArtists, events } from '../db/schema/events';
import { venues } from '../db/schema/venues';
import { CANDIDATE_WINDOW_MS, MAX_CANDIDATES } from './config';
import type { CandidateEvent, DbTx, NormalizedEvent } from './types';
import type { SourceType } from '@the-drop/types';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** architecture/dedup-engine.md Step 3: same start +/- 1 day, same city when known, not cancelled. */
export async function findCandidates(
  tx: DbTx,
  incoming: NormalizedEvent,
): Promise<CandidateEvent[]> {
  const startsAt = new Date(incoming.startsAt);
  const conditions = [
    gte(events.startsAt, new Date(startsAt.getTime() - CANDIDATE_WINDOW_MS)),
    lte(events.startsAt, new Date(startsAt.getTime() + CANDIDATE_WINDOW_MS)),
    ne(events.status, 'CANCELLED'),
  ];
  if (incoming.venueCity) {
    conditions.push(sql`${venues.city} ilike ${escapeLike(incoming.venueCity)}`);
  }

  const rows = await tx
    .select({
      eventId: events.id,
      title: events.title,
      startsAt: events.startsAt,
      venueId: events.venueId,
      venueName: venues.name,
      venueTicketmasterId: venues.ticketmasterId,
      venueSeatgeekId: venues.seatgeekId,
    })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(and(...conditions))
    .limit(MAX_CANDIDATES);

  if (rows.length === 0) return [];
  const eventIds = rows.map((row) => row.eventId);

  const [artistRows, sourceRows] = await Promise.all([
    tx
      .select({ eventId: eventArtists.eventId, name: artists.name })
      .from(eventArtists)
      .innerJoin(artists, eq(artists.id, eventArtists.artistId))
      .where(inArray(eventArtists.eventId, eventIds)),
    tx
      .select({ eventId: eventSources.eventId, sourceType: eventSources.sourceType })
      .from(eventSources)
      .where(inArray(eventSources.eventId, eventIds)),
  ]);

  const artistsByEvent = new Map<string, string[]>();
  for (const row of artistRows) {
    artistsByEvent.set(row.eventId, [...(artistsByEvent.get(row.eventId) ?? []), row.name]);
  }
  const sourcesByEvent = new Map<string, SourceType[]>();
  for (const row of sourceRows) {
    sourcesByEvent.set(row.eventId, [...(sourcesByEvent.get(row.eventId) ?? []), row.sourceType]);
  }

  return rows.map((row) => ({
    ...row,
    artistNames: artistsByEvent.get(row.eventId) ?? [],
    sourceTypes: sourcesByEvent.get(row.eventId) ?? [],
  }));
}
