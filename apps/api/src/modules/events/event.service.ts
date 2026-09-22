import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, sql, type SQL } from 'drizzle-orm';
import type {
  ConfidenceLevel,
  EventStatus,
  SourceType,
  VendorClassification,
} from '@the-drop/types';
import { db } from '../../db/client';
import { events, eventArtists, eventGenres } from '../../db/schema/events';
import { venues } from '../../db/schema/venues';
import { artistGenres, artists } from '../../db/schema/artists';
import { genres } from '../../db/schema/genres';
import { ticketLinks } from '../../db/schema/ticket-links';
import { eventSources } from '../../db/schema/event-sources';
import { userEventStates } from '../../db/schema/user-event-states';
import { confidenceForSource } from '../../dedup/merge-rules';
import { NotFoundError, NotImplementedError, ValidationError } from '../../utils/errors';
import { decodeCursor, encodeCursor, parseLimit } from '../../utils/pagination';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FTC_DISCLOSURE = 'This is an affiliate link. We may earn a commission.';

// Sorts events with no known price after every priced event (max postgres integer).
const NULL_PRICE_SORT = 2147483647;
const PRICE_SORT_KEY = sql`coalesce(${events.minPriceCents}, ${sql.raw(String(NULL_PRICE_SORT))})`;

export type EventSort = 'date' | 'relevance' | 'price';

type EventCursor =
  | { sort: 'date'; startsAt: string; id: string }
  | { sort: 'price'; startsAt: string; id: string; price: number };

export interface EventVenueSummary {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string | null;
}

export interface EventVenueDetail extends EventVenueSummary {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  typicalAgeRestriction: string | null;
}

export interface EventArtistSummary {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  isHeadliner: boolean;
}

export interface EventGenreSummary {
  id: string;
  name: string;
}

export interface EventGenreDetail extends EventGenreSummary {
  slug: string;
}

export interface EventArtistDetail extends EventArtistSummary {
  genres: EventGenreDetail[];
}

export interface TicketLinkRow {
  id: string;
  vendorName: string;
  vendorClassification: VendorClassification;
  url: string;
  affiliateUrl: string | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  ticketType: string | null;
  feesKnown: boolean;
  lastCheckedAt: Date | null;
}

export interface TicketLinkSummary extends TicketLinkRow {
  ftcDisclosure: string | null;
}

export interface EventSourceSummary {
  sourceType: SourceType;
  sourceUrl: string | null;
  lastSyncedAt: Date;
  confidence: ConfidenceLevel;
}

export interface EventListItem {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  venue: EventVenueSummary | null;
  artists: EventArtistSummary[];
  genres: EventGenreSummary[];
  minPriceCents: number | null;
  status: string;
  ageRestriction: string | null;
  artistCount: number;
  userState: string | null;
  recommendationScore: number | null;
}

export interface EventDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  venue: EventVenueDetail | null;
  artists: EventArtistDetail[];
  genres: EventGenreDetail[];
  ticketLinks: TicketLinkSummary[];
  sources: EventSourceSummary[];
  status: string;
  ageRestriction: string | null;
  doorTime: string | null;
  reentryPolicy: string | null;
  bagPolicy: string | null;
  prohibitedItems: string | null;
  dressCode: string | null;
  minPriceCents: number | null;
  artistCount: number;
  confidence: ConfidenceLevel;
  primarySource: SourceType;
  lastVerifiedAt: Date | null;
  userState: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListEventsOptions {
  q?: string;
  city?: string;
  state?: string;
  startsAfter?: Date;
  startsBefore?: Date;
  genreId?: string;
  venueId?: string;
  artistId?: string;
  ageRestriction?: string;
  priceMin?: number;
  priceMax?: number;
  status?: Exclude<EventStatus, 'DRAFT'>;
  sort?: EventSort;
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface ListEventsResult {
  data: EventListItem[];
  cursor: string | null;
}

export function toTicketLinkSummary(row: TicketLinkRow): TicketLinkSummary {
  return { ...row, ftcDisclosure: row.affiliateUrl !== null ? FTC_DISCLOSURE : null };
}

/** The events + venue columns every event-summary query selects. */
export const eventListColumns = {
  id: events.id,
  title: events.title,
  slug: events.slug,
  imageUrl: events.imageUrl,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  timezone: events.timezone,
  ageRestriction: events.ageRestriction,
  artistCount: events.artistCount,
  minPriceCents: events.minPriceCents,
  status: events.status,
  venueId: events.venueId,
  venueName: venues.name,
  venueSlug: venues.slug,
  venueCity: venues.city,
  venueState: venues.state,
};

export interface EventListRow {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  ageRestriction: string | null;
  artistCount: number;
  minPriceCents: number | null;
  status: string;
  venueId: string | null;
  venueName: string | null;
  venueSlug: string | null;
  venueCity: string | null;
  venueState: string | null;
}

export function toEventListItem(
  row: EventListRow,
  artistsForEvent: EventArtistSummary[] | undefined,
  genresForEvent: EventGenreSummary[] | undefined,
  userState: string | undefined,
  recommendationScore: number | null = null,
): EventListItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    imageUrl: row.imageUrl,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    venue: row.venueId
      ? {
          id: row.venueId,
          name: row.venueName!,
          slug: row.venueSlug!,
          city: row.venueCity!,
          state: row.venueState,
        }
      : null,
    artists: artistsForEvent ?? [],
    genres: genresForEvent ?? [],
    minPriceCents: row.minPriceCents,
    status: row.status,
    ageRestriction: row.ageRestriction,
    artistCount: row.artistCount,
    userState: userState ?? null,
    recommendationScore,
  };
}

function decodeEventCursor(cursor: string, sort: EventSort): EventCursor {
  const decoded = decodeCursor<{ startsAt?: unknown; id?: unknown; price?: unknown }>(cursor);
  const { startsAt, id, price } = decoded;
  if (
    typeof startsAt !== 'string' ||
    Number.isNaN(Date.parse(startsAt)) ||
    typeof id !== 'string' ||
    !UUID_REGEX.test(id)
  ) {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }
  if (sort === 'price') {
    if (typeof price !== 'number' || !Number.isInteger(price)) {
      throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
    }
    return { sort: 'price', startsAt, id, price };
  }
  return { sort: 'date', startsAt, id };
}

export async function fetchArtistsForEvents(
  eventIds: string[],
): Promise<Map<string, EventArtistSummary[]>> {
  const result = new Map<string, EventArtistSummary[]>();
  if (eventIds.length === 0) return result;

  const rows = await db
    .select({
      eventId: eventArtists.eventId,
      id: artists.id,
      name: artists.name,
      slug: artists.slug,
      imageUrl: artists.imageUrl,
      isHeadliner: eventArtists.isHeadliner,
      sortOrder: eventArtists.sortOrder,
    })
    .from(eventArtists)
    .innerJoin(artists, eq(artists.id, eventArtists.artistId))
    .where(inArray(eventArtists.eventId, eventIds))
    .orderBy(asc(eventArtists.sortOrder));

  for (const row of rows) {
    const list = result.get(row.eventId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      imageUrl: row.imageUrl,
      isHeadliner: row.isHeadliner,
    });
    result.set(row.eventId, list);
  }

  return result;
}

export async function fetchGenresForEvents(
  eventIds: string[],
): Promise<Map<string, EventGenreDetail[]>> {
  const result = new Map<string, EventGenreDetail[]>();
  if (eventIds.length === 0) return result;

  const rows = await db
    .select({
      eventId: eventGenres.eventId,
      id: genres.id,
      name: genres.name,
      slug: genres.slug,
    })
    .from(eventGenres)
    .innerJoin(genres, eq(genres.id, eventGenres.genreId))
    .where(inArray(eventGenres.eventId, eventIds));

  for (const row of rows) {
    const list = result.get(row.eventId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug });
    result.set(row.eventId, list);
  }

  return result;
}

async function fetchGenresForArtists(
  artistIds: string[],
): Promise<Map<string, EventGenreDetail[]>> {
  const result = new Map<string, EventGenreDetail[]>();
  if (artistIds.length === 0) return result;

  const rows = await db
    .select({
      artistId: artistGenres.artistId,
      id: genres.id,
      name: genres.name,
      slug: genres.slug,
    })
    .from(artistGenres)
    .innerJoin(genres, eq(genres.id, artistGenres.genreId))
    .where(inArray(artistGenres.artistId, artistIds));

  for (const row of rows) {
    const list = result.get(row.artistId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug });
    result.set(row.artistId, list);
  }

  return result;
}

export async function fetchUserStates(
  userId: string | undefined,
  eventIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!userId || eventIds.length === 0) return result;

  const rows = await db
    .select({ eventId: userEventStates.eventId, state: userEventStates.state })
    .from(userEventStates)
    .where(and(eq(userEventStates.userId, userId), inArray(userEventStates.eventId, eventIds)));

  for (const row of rows) {
    result.set(row.eventId, row.state);
  }

  return result;
}

export async function listEvents(opts: ListEventsOptions): Promise<ListEventsResult> {
  const sort = opts.sort ?? 'date';
  if (sort === 'relevance') {
    throw new NotImplementedError('Relevance sorting arrives with search');
  }

  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeEventCursor(opts.cursor, sort) : undefined;
  const status = opts.status ?? 'PUBLISHED';

  const conditions: SQL[] = [eq(events.status, status)];

  if (opts.q) {
    conditions.push(ilike(events.title, `%${opts.q}%`));
  }
  if (opts.startsAfter) {
    conditions.push(gte(events.startsAt, opts.startsAfter));
  } else if (status === 'PUBLISHED') {
    conditions.push(gte(events.startsAt, sql`now()`));
  }
  if (opts.startsBefore) {
    conditions.push(lte(events.startsAt, opts.startsBefore));
  }
  if (opts.genreId) {
    conditions.push(
      sql`exists (select 1 from ${eventGenres} where ${eventGenres.eventId} = ${events.id} and ${eventGenres.genreId} = ${opts.genreId})`,
    );
  }
  if (opts.venueId) {
    conditions.push(eq(events.venueId, opts.venueId));
  }
  if (opts.artistId) {
    conditions.push(
      sql`exists (select 1 from ${eventArtists} where ${eventArtists.eventId} = ${events.id} and ${eventArtists.artistId} = ${opts.artistId})`,
    );
  }
  if (opts.city) {
    conditions.push(
      sql`exists (select 1 from ${venues} where ${venues.id} = ${events.venueId} and ${venues.city} ilike ${opts.city})`,
    );
  }
  if (opts.state) {
    conditions.push(
      sql`exists (select 1 from ${venues} where ${venues.id} = ${events.venueId} and ${venues.state} = ${opts.state.toUpperCase()})`,
    );
  }
  if (opts.ageRestriction) {
    conditions.push(eq(events.ageRestriction, opts.ageRestriction));
  }
  if (opts.priceMin !== undefined) {
    conditions.push(gte(events.minPriceCents, opts.priceMin));
  }
  if (opts.priceMax !== undefined) {
    conditions.push(lte(events.minPriceCents, opts.priceMax));
  }
  if (cursorData?.sort === 'price') {
    conditions.push(
      sql`(${PRICE_SORT_KEY}, ${events.startsAt}, ${events.id}) > (${cursorData.price}::integer, ${cursorData.startsAt}::timestamptz, ${cursorData.id}::uuid)`,
    );
  } else if (cursorData) {
    conditions.push(
      sql`(${events.startsAt}, ${events.id}) > (${cursorData.startsAt}::timestamptz, ${cursorData.id}::uuid)`,
    );
  }

  const rows = await db
    .select(eventListColumns)
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(and(...conditions))
    .orderBy(
      ...(sort === 'price'
        ? [asc(PRICE_SORT_KEY), asc(events.startsAt), asc(events.id)]
        : [asc(events.startsAt), asc(events.id)]),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const eventIds = page.map((r) => r.id);

  const [artistsByEvent, genresByEvent, statesByEvent] = await Promise.all([
    fetchArtistsForEvents(eventIds),
    fetchGenresForEvents(eventIds),
    fetchUserStates(opts.userId, eventIds),
  ]);

  const data: EventListItem[] = page.map((row) =>
    toEventListItem(
      row,
      artistsByEvent.get(row.id),
      genresByEvent.get(row.id),
      statesByEvent.get(row.id),
    ),
  );

  const last = page[page.length - 1];
  let cursor: string | null = null;
  if (hasMore && last) {
    const key = { startsAt: last.startsAt.toISOString(), id: last.id };
    cursor = encodeCursor(
      sort === 'price' ? { price: last.minPriceCents ?? NULL_PRICE_SORT, ...key } : key,
    );
  }

  return { data, cursor };
}

export async function getEvent(
  idOrSlug: string,
  userId?: string,
): Promise<EventDetail> {
  const lookup = UUID_REGEX.test(idOrSlug)
    ? eq(events.id, idOrSlug)
    : eq(events.slug, idOrSlug);
  const condition = and(lookup, ne(events.status, 'DRAFT'));

  const [row] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      description: events.description,
      imageUrl: events.imageUrl,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      timezone: events.timezone,
      status: events.status,
      ageRestriction: events.ageRestriction,
      doorTime: events.doorTime,
      reentryPolicy: events.reentryPolicy,
      bagPolicy: events.bagPolicy,
      prohibitedItems: events.prohibitedItems,
      dressCode: events.dressCode,
      minPriceCents: events.minPriceCents,
      artistCount: events.artistCount,
      confidence: events.confidence,
      primarySource: events.primarySource,
      lastVerifiedAt: events.lastVerifiedAt,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
      venueId: events.venueId,
      venueName: venues.name,
      venueSlug: venues.slug,
      venueAddress: venues.address,
      venueCity: venues.city,
      venueState: venues.state,
      venueLatitude: venues.latitude,
      venueLongitude: venues.longitude,
      venueCapacity: venues.capacity,
      venueTypicalAgeRestriction: venues.typicalAgeRestriction,
    })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(condition)
    .limit(1);

  if (!row) {
    throw new NotFoundError('Event not found');
  }

  const [eventArtistsList, eventGenresList, ticketLinkRows, sourceRows, userStates] =
    await Promise.all([
      fetchArtistsForEvents([row.id]).then((m) => m.get(row.id) ?? []),
      fetchGenresForEvents([row.id]).then((m) => m.get(row.id) ?? []),
      db
        .select({
          id: ticketLinks.id,
          vendorName: ticketLinks.vendorName,
          vendorClassification: ticketLinks.vendorClassification,
          url: ticketLinks.url,
          affiliateUrl: ticketLinks.affiliateUrl,
          priceMinCents: ticketLinks.priceMinCents,
          priceMaxCents: ticketLinks.priceMaxCents,
          currency: ticketLinks.currency,
          ticketType: ticketLinks.ticketType,
          feesKnown: ticketLinks.feesKnown,
          lastCheckedAt: ticketLinks.lastCheckedAt,
        })
        .from(ticketLinks)
        .where(eq(ticketLinks.eventId, row.id))
        .orderBy(asc(ticketLinks.createdAt), asc(ticketLinks.id)),
      db
        .select({
          sourceType: eventSources.sourceType,
          sourceUrl: eventSources.sourceUrl,
          lastSyncedAt: eventSources.lastSyncedAt,
        })
        .from(eventSources)
        .where(eq(eventSources.eventId, row.id))
        .orderBy(desc(eventSources.lastSyncedAt), asc(eventSources.id)),
      fetchUserStates(userId, [row.id]),
    ]);

  const genresByArtist = await fetchGenresForArtists(eventArtistsList.map((a) => a.id));

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    venue: row.venueId
      ? {
          id: row.venueId,
          name: row.venueName!,
          slug: row.venueSlug!,
          address: row.venueAddress,
          city: row.venueCity!,
          state: row.venueState,
          latitude: row.venueLatitude,
          longitude: row.venueLongitude,
          capacity: row.venueCapacity,
          typicalAgeRestriction: row.venueTypicalAgeRestriction,
        }
      : null,
    artists: eventArtistsList.map((artist) => ({
      ...artist,
      genres: genresByArtist.get(artist.id) ?? [],
    })),
    genres: eventGenresList,
    ticketLinks: ticketLinkRows.map(toTicketLinkSummary),
    sources: sourceRows.map((source) => ({
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl,
      lastSyncedAt: source.lastSyncedAt,
      confidence: confidenceForSource(source.sourceType),
    })),
    status: row.status,
    ageRestriction: row.ageRestriction,
    doorTime: row.doorTime,
    reentryPolicy: row.reentryPolicy,
    bagPolicy: row.bagPolicy,
    prohibitedItems: row.prohibitedItems,
    dressCode: row.dressCode,
    minPriceCents: row.minPriceCents,
    artistCount: row.artistCount,
    confidence: row.confidence,
    primarySource: row.primarySource,
    lastVerifiedAt: row.lastVerifiedAt,
    userState: userStates.get(row.id) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getEventsByArtist(
  artistIdOrSlug: string,
  opts: { cursor?: string; limit?: number; userId?: string },
): Promise<ListEventsResult> {
  const artistCondition = UUID_REGEX.test(artistIdOrSlug)
    ? eq(artists.id, artistIdOrSlug)
    : eq(artists.slug, artistIdOrSlug);

  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(artistCondition)
    .limit(1);

  if (!artist) {
    throw new NotFoundError('Artist not found');
  }

  return listEvents({ ...opts, artistId: artist.id });
}

export async function getEventsByVenue(
  venueIdOrSlug: string,
  opts: { upcoming?: boolean; cursor?: string; limit?: number; userId?: string },
): Promise<ListEventsResult> {
  const venueCondition = UUID_REGEX.test(venueIdOrSlug)
    ? eq(venues.id, venueIdOrSlug)
    : eq(venues.slug, venueIdOrSlug);

  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(venueCondition)
    .limit(1);

  if (!venue) {
    throw new NotFoundError('Venue not found');
  }

  const { upcoming, ...rest } = opts;
  // A past startsAfter suppresses listEvents' default "starts_at >= now()" window.
  return listEvents({
    ...rest,
    venueId: venue.id,
    startsAfter: upcoming === false ? new Date(0) : undefined,
  });
}
