import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { ConfidenceLevel, EventStatus, SourceType } from '@the-drop/types';
import { db } from '../../db/client';
import { artists } from '../../db/schema/artists';
import { eventSources, incomingEvents } from '../../db/schema/event-sources';
import { eventArtists, eventGenres, events } from '../../db/schema/events';
import { genres } from '../../db/schema/genres';
import { communitySubmissions } from '../../db/schema/submissions';
import { venues } from '../../db/schema/venues';
import { generateEventSlug } from '../../dedup/merger';
import type { DbTx } from '../../dedup/types';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { decodeTimestampIdCursor, encodeCursor, parseLimit } from '../../utils/pagination';
import {
  fetchArtistsForEvents,
  fetchGenresForEvents,
  type EventArtistSummary,
  type EventGenreDetail,
  type EventVenueSummary,
} from '../events/event.service';
import { logAdminAction } from './audit';
import type {
  CreateAdminEventInput,
  ListAdminEventsQuery,
  UpdateAdminEventInput,
} from './admin-event.validation';

/** Fields the dedup merge rules weigh by source; an admin edit stamps them ADMIN so syncs stop overwriting them. */
export const PROVENANCE_TRACKED_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'description',
  'imageUrl',
  'startsAt',
  'endsAt',
  'venueId',
]);

const SCALAR_UPDATE_FIELDS = [
  'title',
  'description',
  'imageUrl',
  'startsAt',
  'endsAt',
  'timezone',
  'venueId',
  'status',
  'ageRestriction',
  'doorTime',
  'reentryPolicy',
  'bagPolicy',
  'prohibitedItems',
  'dressCode',
] as const;

export interface AdminEventSource {
  sourceType: SourceType;
  externalId: string | null;
  sourceUrl: string | null;
  lastSyncedAt: Date;
}

export interface AdminEventListItem {
  id: string;
  title: string;
  slug: string;
  startsAt: Date;
  status: EventStatus;
  venue: { id: string; name: string; city: string; state: string | null } | null;
  artistCount: number;
  primarySource: SourceType;
  confidence: ConfidenceLevel;
  createdAt: Date;
  updatedAt: Date;
  sources: AdminEventSource[];
}

export interface AdminEventDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  status: EventStatus;
  venue: EventVenueSummary | null;
  artists: EventArtistSummary[];
  genres: EventGenreDetail[];
  ageRestriction: string | null;
  doorTime: string | null;
  reentryPolicy: string | null;
  bagPolicy: string | null;
  prohibitedItems: string | null;
  dressCode: string | null;
  primarySource: SourceType;
  confidence: ConfidenceLevel;
  fieldProvenance: Record<string, string>;
  lastVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  sources: AdminEventSource[];
}

export interface ListAdminEventsResult {
  data: AdminEventListItem[];
  cursor: string | null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function fetchSources(eventIds: string[]): Promise<Map<string, AdminEventSource[]>> {
  const result = new Map<string, AdminEventSource[]>();
  if (eventIds.length === 0) return result;

  const rows = await db
    .select({
      eventId: eventSources.eventId,
      sourceType: eventSources.sourceType,
      externalId: eventSources.externalId,
      sourceUrl: eventSources.sourceUrl,
      lastSyncedAt: eventSources.lastSyncedAt,
    })
    .from(eventSources)
    .where(inArray(eventSources.eventId, eventIds))
    .orderBy(asc(eventSources.createdAt));

  for (const row of rows) {
    const list = result.get(row.eventId) ?? [];
    list.push({
      sourceType: row.sourceType,
      externalId: row.externalId,
      sourceUrl: row.sourceUrl,
      lastSyncedAt: row.lastSyncedAt,
    });
    result.set(row.eventId, list);
  }
  return result;
}

/** Unlike the public event endpoints, admins can see DRAFT and CANCELLED events. */
export async function listAdminEvents(opts: ListAdminEventsQuery): Promise<ListAdminEventsResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeTimestampIdCursor(opts.cursor, 'createdAt') : undefined;

  const conditions: SQL[] = [];
  if (opts.q) {
    conditions.push(ilike(events.title, `%${escapeLike(opts.q)}%`));
  }
  if (opts.status) {
    conditions.push(eq(events.status, opts.status));
  }
  if (opts.stale === true) {
    conditions.push(isNotNull(events.staleFlaggedAt));
  } else if (opts.stale === false) {
    conditions.push(isNull(events.staleFlaggedAt));
  }
  if (cursorData) {
    conditions.push(
      sql`(${events.createdAt}, ${events.id}) < (${cursorData.at}::timestamptz, ${cursorData.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      startsAt: events.startsAt,
      status: events.status,
      artistCount: events.artistCount,
      primarySource: events.primarySource,
      confidence: events.confidence,
      createdAt: events.createdAt,
      updatedAt: events.updatedAt,
      venueId: venues.id,
      venueName: venues.name,
      venueCity: venues.city,
      venueState: venues.state,
    })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const sourcesByEvent = await fetchSources(page.map((row) => row.id));

  const data: AdminEventListItem[] = page.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    startsAt: row.startsAt,
    status: row.status,
    venue: row.venueId
      ? { id: row.venueId, name: row.venueName!, city: row.venueCity!, state: row.venueState }
      : null,
    artistCount: row.artistCount,
    primarySource: row.primarySource,
    confidence: row.confidence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sources: sourcesByEvent.get(row.id) ?? [],
  }));

  const last = page[page.length - 1];
  const cursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;

  return { data, cursor };
}

// The full-text search vector is maintained by a trigger and is never returned, so don't fetch it.
const { searchVector: _searchVector, ...adminEventColumns } = getTableColumns(events);

export async function getAdminEvent(eventId: string): Promise<AdminEventDetail> {
  const [row] = await db
    .select({
      event: adminEventColumns,
      venueId: venues.id,
      venueName: venues.name,
      venueSlug: venues.slug,
      venueCity: venues.city,
      venueState: venues.state,
    })
    .from(events)
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(eq(events.id, eventId))
    .limit(1);
  if (!row) {
    throw new NotFoundError('Event not found');
  }

  const [artistsByEvent, genresByEvent, sourcesByEvent] = await Promise.all([
    fetchArtistsForEvents([eventId]),
    fetchGenresForEvents([eventId]),
    fetchSources([eventId]),
  ]);
  const event = row.event;

  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    description: event.description,
    imageUrl: event.imageUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    status: event.status,
    venue: row.venueId
      ? {
          id: row.venueId,
          name: row.venueName!,
          slug: row.venueSlug!,
          city: row.venueCity!,
          state: row.venueState,
        }
      : null,
    artists: artistsByEvent.get(eventId) ?? [],
    genres: genresByEvent.get(eventId) ?? [],
    ageRestriction: event.ageRestriction,
    doorTime: event.doorTime,
    reentryPolicy: event.reentryPolicy,
    bagPolicy: event.bagPolicy,
    prohibitedItems: event.prohibitedItems,
    dressCode: event.dressCode,
    primarySource: event.primarySource,
    confidence: event.confidence,
    fieldProvenance: (event.fieldProvenance ?? {}) as Record<string, string>,
    lastVerifiedAt: event.lastVerifiedAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    sources: sourcesByEvent.get(eventId) ?? [],
  };
}

/** Rejects a request that references a venue, artist or genre that doesn't exist, naming the missing IDs. */
async function assertReferencesExist(
  tx: DbTx,
  refs: { venueId?: string | null; artistIds?: string[]; genreIds?: string[] },
): Promise<void> {
  if (refs.venueId) {
    const [venue] = await tx
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, refs.venueId))
      .limit(1);
    if (!venue) {
      throw new ValidationError('Venue not found', { field: 'venueId' });
    }
  }
  if (refs.artistIds && refs.artistIds.length > 0) {
    const found = await tx
      .select({ id: artists.id })
      .from(artists)
      .where(inArray(artists.id, refs.artistIds));
    const known = new Set(found.map((row) => row.id));
    const missing = refs.artistIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new ValidationError('Unknown artist IDs', { field: 'artistIds', missing });
    }
  }
  if (refs.genreIds && refs.genreIds.length > 0) {
    const found = await tx
      .select({ id: genres.id })
      .from(genres)
      .where(inArray(genres.id, refs.genreIds));
    const known = new Set(found.map((row) => row.id));
    const missing = refs.genreIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new ValidationError('Unknown genre IDs', { field: 'genreIds', missing });
    }
  }
}

/** The first artist listed is the headliner; list order is the billing order. */
async function replaceArtists(tx: DbTx, eventId: string, artistIds: string[]): Promise<void> {
  await tx.delete(eventArtists).where(eq(eventArtists.eventId, eventId));
  if (artistIds.length > 0) {
    await tx.insert(eventArtists).values(
      artistIds.map((artistId, index) => ({ eventId, artistId, isHeadliner: index === 0, sortOrder: index })),
    );
  }
  await tx.update(events).set({ artistCount: artistIds.length }).where(eq(events.id, eventId));
}

async function replaceGenres(tx: DbTx, eventId: string, genreIds: string[]): Promise<void> {
  await tx.delete(eventGenres).where(eq(eventGenres.eventId, eventId));
  if (genreIds.length > 0) {
    await tx.insert(eventGenres).values(genreIds.map((genreId) => ({ eventId, genreId })));
  }
}

export async function createAdminEvent(
  adminId: string,
  input: CreateAdminEventInput,
): Promise<AdminEventDetail> {
  const eventId = await db.transaction(async (tx) => {
    await assertReferencesExist(tx, {
      venueId: input.venueId,
      artistIds: input.artistIds,
      genreIds: input.genreIds,
    });

    const provenance: Record<string, string> = { title: 'ADMIN', startsAt: 'ADMIN' };
    if (input.endsAt) provenance.endsAt = 'ADMIN';
    if (input.description) provenance.description = 'ADMIN';
    if (input.imageUrl) provenance.imageUrl = 'ADMIN';
    if (input.venueId) provenance.venueId = 'ADMIN';

    const slug = await generateEventSlug(tx, input.title, input.startsAt);
    const [created] = await tx
      .insert(events)
      .values({
        title: input.title,
        slug,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        ...(input.timezone ? { timezone: input.timezone } : {}),
        venueId: input.venueId ?? null,
        status: input.status,
        ageRestriction: input.ageRestriction ?? null,
        doorTime: input.doorTime ?? null,
        reentryPolicy: input.reentryPolicy ?? null,
        bagPolicy: input.bagPolicy ?? null,
        prohibitedItems: input.prohibitedItems ?? null,
        dressCode: input.dressCode ?? null,
        primarySource: 'ADMIN',
        confidence: 'ADMIN_VERIFIED',
        fieldProvenance: provenance,
        lastVerifiedAt: new Date(),
      })
      .returning({ id: events.id });
    if (!created) {
      throw new Error('Failed to create event');
    }

    await replaceArtists(tx, created.id, input.artistIds);
    await replaceGenres(tx, created.id, input.genreIds);

    await logAdminAction(tx, {
      adminId,
      action: 'create_event',
      targetType: 'event',
      targetId: created.id,
      details: { title: input.title, status: input.status },
    });
    return created.id;
  });

  return getAdminEvent(eventId);
}

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function serializable(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

export async function updateAdminEvent(
  adminId: string,
  eventId: string,
  input: UpdateAdminEventInput,
): Promise<AdminEventDetail> {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!existing) {
      throw new NotFoundError('Event not found');
    }

    await assertReferencesExist(tx, {
      venueId: input.venueId,
      artistIds: input.artistIds,
      genreIds: input.genreIds,
    });

    const startsAt = input.startsAt ?? existing.startsAt;
    const endsAt = input.endsAt !== undefined ? input.endsAt : existing.endsAt;
    if (endsAt && endsAt <= startsAt) {
      throw new ValidationError('endsAt must be after startsAt', { field: 'endsAt' });
    }

    const columns: Record<string, unknown> = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const provenance = { ...((existing.fieldProvenance ?? {}) as Record<string, string>) };
    const current = existing as Record<string, unknown>;

    for (const field of SCALAR_UPDATE_FIELDS) {
      const next = input[field];
      if (next === undefined || comparable(next) === comparable(current[field])) continue;
      columns[field] = next;
      changes[field] = { from: serializable(current[field]), to: serializable(next) };
      if (PROVENANCE_TRACKED_FIELDS.has(field)) provenance[field] = 'ADMIN';
    }

    let artistsChanged = false;
    if (input.artistIds !== undefined) {
      const rows = await tx
        .select({ artistId: eventArtists.artistId })
        .from(eventArtists)
        .where(eq(eventArtists.eventId, eventId))
        .orderBy(asc(eventArtists.sortOrder));
      artistsChanged = rows.map((row) => row.artistId).join() !== input.artistIds.join();
    }

    let genresChanged = false;
    if (input.genreIds !== undefined) {
      const rows = await tx
        .select({ genreId: eventGenres.genreId })
        .from(eventGenres)
        .where(eq(eventGenres.eventId, eventId));
      const currentIds = new Set(rows.map((row) => row.genreId));
      genresChanged =
        currentIds.size !== input.genreIds.length ||
        input.genreIds.some((id) => !currentIds.has(id));
    }

    if (Object.keys(columns).length === 0 && !artistsChanged && !genresChanged) {
      return;
    }

    await tx
      .update(events)
      .set({
        ...(columns as Partial<typeof events.$inferInsert>),
        fieldProvenance: provenance,
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));

    if (artistsChanged) await replaceArtists(tx, eventId, input.artistIds!);
    if (genresChanged) await replaceGenres(tx, eventId, input.genreIds!);

    await logAdminAction(tx, {
      adminId,
      action: 'update_event',
      targetType: 'event',
      targetId: eventId,
      details: {
        changes,
        ...(artistsChanged ? { artistIds: input.artistIds } : {}),
        ...(genresChanged ? { genreIds: input.genreIds } : {}),
      },
    });
  });

  return getAdminEvent(eventId);
}

/**
 * A draft that nothing else points at is deleted outright. Anything else (published, or referenced by
 * ingestion records / submissions that can't be orphaned) is cancelled instead, so history stays intact.
 */
export async function deleteAdminEvent(adminId: string, eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx
      .select({ id: events.id, title: events.title, status: events.status })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    let mode: 'deleted' | 'cancelled' = 'cancelled';
    if (event.status === 'DRAFT') {
      const [ingested] = await tx
        .select({ id: incomingEvents.id })
        .from(incomingEvents)
        .where(eq(incomingEvents.matchedEventId, eventId))
        .limit(1);
      const [submitted] = await tx
        .select({ id: communitySubmissions.id })
        .from(communitySubmissions)
        .where(eq(communitySubmissions.mergedEventId, eventId))
        .limit(1);
      if (!ingested && !submitted) mode = 'deleted';
    }

    if (mode === 'deleted') {
      await tx.delete(events).where(eq(events.id, eventId));
    } else {
      await tx
        .update(events)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(events.id, eventId));
    }

    await logAdminAction(tx, {
      adminId,
      action: 'delete_event',
      targetType: 'event',
      targetId: eventId,
      details: { title: event.title, previousStatus: event.status, mode },
    });
  });
}
