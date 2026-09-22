import { and, asc, count, eq, gte, ilike, sql } from 'drizzle-orm';
import type { ConfidenceLevel, SourceType } from '@the-drop/types';
import { db } from '../../db/client';
import { events } from '../../db/schema/events';
import { venues } from '../../db/schema/venues';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { decodeCursor, encodeCursor, parseLimit } from '../../utils/pagination';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface VenueCursor {
  name: string;
  id: string;
}

export interface VenueListItem {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string | null;
  country: string;
  imageUrl: string | null;
  venueType: string | null;
  capacity: number | null;
}

export interface VenueDetail {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string;
  state: string | null;
  country: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  capacity: number | null;
  venueType: string | null;
  imageUrl: string | null;
  typicalAgeRestriction: string | null;
  typicalBagPolicy: string | null;
  confidence: ConfidenceLevel;
  primarySource: SourceType;
  upcomingEventCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListVenuesOptions {
  q?: string;
  city?: string;
  state?: string;
  cursor?: string;
  limit?: number;
}

export interface ListVenuesResult {
  data: VenueListItem[];
  cursor: string | null;
}

function decodeVenueCursor(cursor: string): VenueCursor {
  const decoded = decodeCursor<{ name?: unknown; id?: unknown }>(cursor);
  if (typeof decoded.name !== 'string' || typeof decoded.id !== 'string') {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }
  return { name: decoded.name, id: decoded.id };
}

export async function listVenues(opts: ListVenuesOptions): Promise<ListVenuesResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeVenueCursor(opts.cursor) : undefined;

  const conditions = [];
  if (opts.q) {
    conditions.push(ilike(venues.name, `%${opts.q}%`));
  }
  if (opts.city) {
    conditions.push(ilike(venues.city, opts.city));
  }
  if (opts.state) {
    conditions.push(eq(venues.state, opts.state.toUpperCase()));
  }
  if (cursorData) {
    conditions.push(
      sql`(${venues.name}, ${venues.id}) > (${cursorData.name}, ${cursorData.id})`,
    );
  }

  const rows = await db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      city: venues.city,
      state: venues.state,
      country: venues.country,
      imageUrl: venues.imageUrl,
      venueType: venues.venueType,
      capacity: venues.capacity,
    })
    .from(venues)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(venues.name), asc(venues.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const last = page[page.length - 1];
  const cursor = hasMore && last ? encodeCursor({ name: last.name, id: last.id }) : null;

  return { data: page, cursor };
}

export async function getVenue(idOrSlug: string): Promise<VenueDetail> {
  const condition = UUID_REGEX.test(idOrSlug)
    ? eq(venues.id, idOrSlug)
    : eq(venues.slug, idOrSlug);

  const [row] = await db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      address: venues.address,
      city: venues.city,
      state: venues.state,
      country: venues.country,
      postalCode: venues.postalCode,
      latitude: venues.latitude,
      longitude: venues.longitude,
      timezone: venues.timezone,
      capacity: venues.capacity,
      venueType: venues.venueType,
      imageUrl: venues.imageUrl,
      typicalAgeRestriction: venues.typicalAgeRestriction,
      typicalBagPolicy: venues.typicalBagPolicy,
      confidence: venues.confidence,
      primarySource: venues.primarySource,
      createdAt: venues.createdAt,
      updatedAt: venues.updatedAt,
    })
    .from(venues)
    .where(condition)
    .limit(1);

  if (!row) {
    throw new NotFoundError('Venue not found');
  }

  const [upcoming] = await db
    .select({ value: count() })
    .from(events)
    .where(
      and(
        eq(events.venueId, row.id),
        eq(events.status, 'PUBLISHED'),
        gte(events.startsAt, sql`now()`),
      ),
    );

  return { ...row, upcomingEventCount: upcoming?.value ?? 0 };
}
