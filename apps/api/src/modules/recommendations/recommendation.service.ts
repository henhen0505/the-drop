import { and, asc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { events } from '../../db/schema/events';
import { userArtistFollows, userEventStates, userGenrePreferences } from '../../db/schema/user-event-states';
import { users } from '../../db/schema/users';
import { venues } from '../../db/schema/venues';
import {
  DEFAULT_TRAVEL_RADIUS_KM,
  MAX_CANDIDATE_EVENTS,
  VENUE_VISIT_STATES,
} from '../../recommendations/config';
import {
  buildExplanation,
  scoreEvent,
  type RecommendationFactors,
} from '../../recommendations/scorer';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { decodeCursor, encodeCursor, parseLimit } from '../../utils/pagination';
import {
  eventListColumns,
  fetchArtistsForEvents,
  fetchGenresForEvents,
  fetchUserStates,
  toEventListItem,
  type EventListItem,
} from '../events/event.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RecommendationItem {
  event: EventListItem;
  score: number;
  explanation: string;
  factors: RecommendationFactors;
}

export interface RecommendationsOptions {
  cursor?: string;
  limit?: number;
}

export interface RecommendationsResult {
  data: RecommendationItem[];
  cursor: string | null;
}

interface RecommendationCursor {
  score: number;
  startsAt: string;
  id: string;
}

function decodeRecommendationCursor(cursor: string): RecommendationCursor {
  const { score, startsAt, id } = decodeCursor<{
    score?: unknown;
    startsAt?: unknown;
    id?: unknown;
  }>(cursor);
  if (
    typeof score !== 'number' ||
    !Number.isFinite(score) ||
    typeof startsAt !== 'string' ||
    Number.isNaN(Date.parse(startsAt)) ||
    typeof id !== 'string' ||
    !UUID_REGEX.test(id)
  ) {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }
  return { score, startsAt, id };
}

interface Ranked {
  id: string;
  score: number;
  startsAt: Date;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Best score first; ties go to the soonest event, then id, so the order is total and stable. */
function compareRanked(a: Ranked, b: Ranked): number {
  return (
    b.score - a.score ||
    a.startsAt.getTime() - b.startsAt.getTime() ||
    compareIds(a.id, b.id)
  );
}

function isAfterCursor(item: Ranked, cursor: RecommendationCursor): boolean {
  if (item.score !== cursor.score) return item.score < cursor.score;
  const cursorTime = Date.parse(cursor.startsAt);
  if (item.startsAt.getTime() !== cursorTime) return item.startsAt.getTime() > cursorTime;
  return item.id > cursor.id;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundFactors(factors: RecommendationFactors): RecommendationFactors {
  return {
    artistAffinity: round4(factors.artistAffinity),
    genreAffinity: round4(factors.genreAffinity),
    distanceScore: round4(factors.distanceScore),
    priceFit: round4(factors.priceFit),
    venueAffinity: round4(factors.venueAffinity),
  };
}

export async function getRecommendations(
  userId: string,
  opts: RecommendationsOptions,
): Promise<RecommendationsResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeRecommendationCursor(opts.cursor) : undefined;

  const [userRows, followedRows, genreRows, visitRows, candidates] = await Promise.all([
    db
      .select({
        latitude: users.preferredLatitude,
        longitude: users.preferredLongitude,
        travelRadiusKm: users.travelRadiusKm,
        priceMinCents: users.priceMinCents,
        priceMaxCents: users.priceMaxCents,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ artistId: userArtistFollows.artistId })
      .from(userArtistFollows)
      .where(eq(userArtistFollows.userId, userId)),
    db
      .select({ genreId: userGenrePreferences.genreId })
      .from(userGenrePreferences)
      .where(eq(userGenrePreferences.userId, userId)),
    db
      .select({ venueId: events.venueId, visits: sql<number>`count(*)::int` })
      .from(userEventStates)
      .innerJoin(events, eq(events.id, userEventStates.eventId))
      .where(
        and(
          eq(userEventStates.userId, userId),
          inArray(userEventStates.state, [...VENUE_VISIT_STATES]),
          isNotNull(events.venueId),
        ),
      )
      .groupBy(events.venueId),
    // No geo filtering here on purpose: a great lineup outside the user's usual radius should still
    // be recommendable, so distance only lowers one weighted factor instead of excluding events.
    db
      .select({
        ...eventListColumns,
        venueLatitude: venues.latitude,
        venueLongitude: venues.longitude,
      })
      .from(events)
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(and(eq(events.status, 'PUBLISHED'), gte(events.startsAt, sql`now()`)))
      .orderBy(asc(events.startsAt), asc(events.id))
      .limit(MAX_CANDIDATE_EVENTS),
  ]);

  const user = userRows[0];
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const followedArtistIds = new Set(followedRows.map((row) => row.artistId));
  const preferredGenreIds = new Set(genreRows.map((row) => row.genreId));
  const visitsByVenue = new Map<string, number>();
  for (const row of visitRows) {
    if (row.venueId) visitsByVenue.set(row.venueId, row.visits);
  }

  const candidateIds = candidates.map((row) => row.id);
  const [artistsByEvent, genresByEvent] = await Promise.all([
    fetchArtistsForEvents(candidateIds),
    fetchGenresForEvents(candidateIds),
  ]);

  const travelRadiusKm = user.travelRadiusKm ?? DEFAULT_TRAVEL_RADIUS_KM;
  const hasPricePrefs = user.priceMinCents !== null || user.priceMaxCents !== null;

  const scored = candidates.map((row) => {
    const eventArtists = artistsByEvent.get(row.id) ?? [];
    const eventGenres = genresByEvent.get(row.id) ?? [];
    const result = scoreEvent({
      eventArtistIds: eventArtists.map((artist) => artist.id),
      eventGenreIds: eventGenres.map((genre) => genre.id),
      eventMinPriceCents: row.minPriceCents,
      venueLatitude: row.venueLatitude,
      venueLongitude: row.venueLongitude,
      userFollowedArtistIds: followedArtistIds,
      userPreferredGenreIds: preferredGenreIds,
      userLatitude: user.latitude,
      userLongitude: user.longitude,
      userTravelRadiusKm: travelRadiusKm,
      userPriceMinCents: user.priceMinCents,
      userPriceMaxCents: user.priceMaxCents,
      venuePastVisitCount: row.venueId ? (visitsByVenue.get(row.venueId) ?? 0) : 0,
    });
    return { row, eventArtists, eventGenres, ...result };
  });

  const ranked = scored
    .map((entry) => ({ entry, key: { id: entry.row.id, score: entry.score, startsAt: entry.row.startsAt } }))
    .sort((a, b) => compareRanked(a.key, b.key))
    .filter(({ key }) => (cursorData ? isAfterCursor(key, cursorData) : true));

  const hasMore = ranked.length > limit;
  const page = hasMore ? ranked.slice(0, limit) : ranked;

  const statesByEvent = await fetchUserStates(
    userId,
    page.map(({ entry }) => entry.row.id),
  );

  const data: RecommendationItem[] = page.map(({ entry }) => {
    const { row, eventArtists, eventGenres, factors, score, distanceKm } = entry;
    const explanation = buildExplanation(factors, {
      matchedArtistNames: eventArtists
        .filter((artist) => followedArtistIds.has(artist.id))
        .map((artist) => artist.name),
      matchedGenreNames: eventGenres
        .filter((genre) => preferredGenreIds.has(genre.id))
        .map((genre) => genre.name),
      distanceKm,
      priceFitEvaluated: hasPricePrefs && row.minPriceCents !== null,
      venueName: row.venueName,
    });

    return {
      event: toEventListItem(row, eventArtists, eventGenres, statesByEvent.get(row.id), round4(score)),
      score: round4(score),
      explanation,
      factors: roundFactors(factors),
    };
  });

  const last = page[page.length - 1];
  const cursor =
    hasMore && last
      ? encodeCursor({
          score: last.key.score,
          startsAt: last.key.startsAt.toISOString(),
          id: last.key.id,
        })
      : null;

  return { data, cursor };
}
