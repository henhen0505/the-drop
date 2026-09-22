import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { events } from '../../db/schema/events';
import { venues } from '../../db/schema/venues';
import { artists, artistGenres } from '../../db/schema/artists';
import { genres } from '../../db/schema/genres';
import type { SearchEntityType } from './search.validation';

// pg_trgm returns a near-zero (but non-zero) similarity for most unrelated
// string pairs; this floor excludes that noise from autocomplete results.
const SIMILARITY_FLOOR = 0.1;

export interface SearchEventResult {
  id: string;
  title: string;
  slug: string;
  startsAt: Date;
  venue: { name: string; city: string } | null;
  rank: number;
}

export interface SearchArtistResult {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  rank: number;
}

export interface SearchVenueResult {
  id: string;
  name: string;
  slug: string;
  city: string;
  rank: number;
}

export interface SearchResult {
  events: SearchEventResult[];
  artists: SearchArtistResult[];
  venues: SearchVenueResult[];
}

export interface SearchOptions {
  q: string;
  types: SearchEntityType[];
  limit: number;
}

export type AutocompleteEntityType = 'artist' | 'event' | 'venue';

export interface AutocompleteItem {
  type: AutocompleteEntityType;
  id: string;
  name: string;
  slug: string;
  subtitle: string;
  similarity: number;
}

export interface AutocompleteOptions {
  q: string;
  limit: number;
}

/** Fetches genre NAMES (not slugs) for a batch of artist IDs, for autocomplete subtitles. */
async function fetchGenreNamesForArtists(artistIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (artistIds.length === 0) return result;

  const rows = await db
    .select({ artistId: artistGenres.artistId, name: genres.name })
    .from(artistGenres)
    .innerJoin(genres, eq(genres.id, artistGenres.genreId))
    .where(inArray(artistGenres.artistId, artistIds));

  for (const row of rows) {
    const list = result.get(row.artistId) ?? [];
    list.push(row.name);
    result.set(row.artistId, list);
  }

  return result;
}

function formatEventSubtitle(
  startsAt: Date,
  timezone: string,
  city: string | null,
  state: string | null,
): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  }).format(startsAt);

  // No venue at all (e.g. an unlinked community submission) -- omit the segment
  // rather than leave a dangling "– " with an empty city.
  if (!city) return formatted;

  // En dash (U+2013), not a hyphen, per the contract's subtitle format.
  return state ? `${formatted} – ${city}, ${state}` : `${formatted} – ${city}`;
}

function formatVenueSubtitle(city: string, state: string | null): string {
  return state ? `${city}, ${state}` : city;
}

async function searchEvents(q: string, limit: number): Promise<SearchEventResult[]> {
  const rank = sql<number>`ts_rank(${events.searchVector}, websearch_to_tsquery('english', ${q}))`;

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      startsAt: events.startsAt,
      venueName: venues.name,
      venueCity: venues.city,
      rank,
    })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(
      and(
        eq(events.status, 'PUBLISHED'),
        sql`${events.searchVector} @@ websearch_to_tsquery('english', ${q})`,
      ),
    )
    .orderBy(desc(rank))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    startsAt: row.startsAt,
    venue: row.venueName !== null && row.venueCity !== null
      ? { name: row.venueName, city: row.venueCity }
      : null,
    rank: row.rank,
  }));
}

async function searchArtists(q: string, limit: number): Promise<SearchArtistResult[]> {
  const rank = sql<number>`ts_rank(${artists.searchVector}, websearch_to_tsquery('english', ${q}))`;

  return db
    .select({
      id: artists.id,
      name: artists.name,
      slug: artists.slug,
      imageUrl: artists.imageUrl,
      rank,
    })
    .from(artists)
    .where(sql`${artists.searchVector} @@ websearch_to_tsquery('english', ${q})`)
    .orderBy(desc(rank))
    .limit(limit);
}

async function searchVenues(q: string, limit: number): Promise<SearchVenueResult[]> {
  const rank = sql<number>`ts_rank(${venues.searchVector}, websearch_to_tsquery('english', ${q}))`;

  return db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      city: venues.city,
      rank,
    })
    .from(venues)
    .where(sql`${venues.searchVector} @@ websearch_to_tsquery('english', ${q})`)
    .orderBy(desc(rank))
    .limit(limit);
}

export async function search(opts: SearchOptions): Promise<SearchResult> {
  const [eventResults, artistResults, venueResults] = await Promise.all([
    opts.types.includes('event') ? searchEvents(opts.q, opts.limit) : Promise.resolve([]),
    opts.types.includes('artist') ? searchArtists(opts.q, opts.limit) : Promise.resolve([]),
    opts.types.includes('venue') ? searchVenues(opts.q, opts.limit) : Promise.resolve([]),
  ]);

  return { events: eventResults, artists: artistResults, venues: venueResults };
}

interface AutocompleteArtistCandidate {
  id: string;
  name: string;
  slug: string;
  similarity: number;
}

interface AutocompleteEventCandidate {
  id: string;
  name: string;
  slug: string;
  startsAt: Date;
  timezone: string;
  venueCity: string | null;
  venueState: string | null;
  similarity: number;
}

interface AutocompleteVenueCandidate {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string | null;
  similarity: number;
}

async function autocompleteArtists(q: string, limit: number): Promise<AutocompleteArtistCandidate[]> {
  const similarity = sql<number>`similarity(${artists.name}, ${q})`;

  return db
    .select({ id: artists.id, name: artists.name, slug: artists.slug, similarity })
    .from(artists)
    .where(sql`similarity(${artists.name}, ${q}) > ${SIMILARITY_FLOOR}`)
    .orderBy(desc(similarity))
    .limit(limit);
}

async function autocompleteEvents(q: string, limit: number): Promise<AutocompleteEventCandidate[]> {
  const similarity = sql<number>`similarity(${events.title}, ${q})`;

  return db
    .select({
      id: events.id,
      name: events.title,
      slug: events.slug,
      startsAt: events.startsAt,
      timezone: events.timezone,
      venueCity: venues.city,
      venueState: venues.state,
      similarity,
    })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(
      and(
        eq(events.status, 'PUBLISHED'),
        sql`similarity(${events.title}, ${q}) > ${SIMILARITY_FLOOR}`,
      ),
    )
    .orderBy(desc(similarity))
    .limit(limit);
}

async function autocompleteVenues(q: string, limit: number): Promise<AutocompleteVenueCandidate[]> {
  const similarity = sql<number>`similarity(${venues.name}, ${q})`;

  return db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      city: venues.city,
      state: venues.state,
      similarity,
    })
    .from(venues)
    .where(sql`similarity(${venues.name}, ${q}) > ${SIMILARITY_FLOOR}`)
    .orderBy(desc(similarity))
    .limit(limit);
}

export async function autocomplete(opts: AutocompleteOptions): Promise<AutocompleteItem[]> {
  const [artistRows, eventRows, venueRows] = await Promise.all([
    autocompleteArtists(opts.q, opts.limit),
    autocompleteEvents(opts.q, opts.limit),
    autocompleteVenues(opts.q, opts.limit),
  ]);

  const genreNamesByArtist = await fetchGenreNamesForArtists(artistRows.map((row) => row.id));

  const items: AutocompleteItem[] = [
    ...artistRows.map((row) => ({
      type: 'artist' as const,
      id: row.id,
      name: row.name,
      slug: row.slug,
      subtitle: (genreNamesByArtist.get(row.id) ?? []).join(' / '),
      similarity: row.similarity,
    })),
    ...eventRows.map((row) => ({
      type: 'event' as const,
      id: row.id,
      name: row.name,
      slug: row.slug,
      subtitle: formatEventSubtitle(row.startsAt, row.timezone, row.venueCity, row.venueState),
      similarity: row.similarity,
    })),
    ...venueRows.map((row) => ({
      type: 'venue' as const,
      id: row.id,
      name: row.name,
      slug: row.slug,
      subtitle: formatVenueSubtitle(row.city, row.state),
      similarity: row.similarity,
    })),
  ];

  return items.sort((a, b) => b.similarity - a.similarity).slice(0, opts.limit);
}
