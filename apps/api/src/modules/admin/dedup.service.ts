import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DedupMatchStatus } from '@the-drop/types';
import { db } from '../../db/client';
import { artists } from '../../db/schema/artists';
import { eventMatchCandidates } from '../../db/schema/dedup';
import { incomingEvents } from '../../db/schema/event-sources';
import { eventArtists, events } from '../../db/schema/events';
import { venues } from '../../db/schema/venues';
import { acquireDedupLock } from '../../dedup/lock';
import { createCanonicalEvent, mergeIntoEvent } from '../../dedup/merger';
import { resolveVenue } from '../../dedup/venue-matcher';
import type { NormalizedEvent } from '../../dedup/types';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { decodeCursor, encodeCursor, parseLimit } from '../../utils/pagination';
import { logAdminAction } from './audit';

interface CandidateCursor {
  createdAt: string;
  id: string;
}

export interface DedupCandidateItem {
  id: string;
  status: DedupMatchStatus;
  incoming: {
    title: string;
    startsAt: Date;
    venueName: string | null;
    artists: string[];
    sourceType: string | null;
  };
  candidate: {
    id: string;
    title: string;
    startsAt: Date;
    venue: { id: string; name: string; city: string } | null;
    artists: string[];
  };
  score: number;
  venueScore: number | null;
  dateScore: number | null;
  titleScore: number | null;
  artistScore: number | null;
  matchDetails: unknown;
  createdAt: Date;
}

export interface ListCandidatesOptions {
  status?: DedupMatchStatus;
  cursor?: string;
  limit?: number;
}

export interface ListCandidatesResult {
  data: DedupCandidateItem[];
  cursor: string | null;
}

export interface ResolvedCandidate {
  id: string;
  status: DedupMatchStatus;
  resultEventId: string;
  reviewedBy: string;
  reviewedAt: Date;
}

function decodeCandidateCursor(cursor: string): CandidateCursor {
  const decoded = decodeCursor<{ createdAt?: unknown; id?: unknown }>(cursor);
  if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }
  return { createdAt: decoded.createdAt, id: decoded.id };
}

export async function listCandidates(opts: ListCandidatesOptions): Promise<ListCandidatesResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeCandidateCursor(opts.cursor) : undefined;

  const conditions = [eq(eventMatchCandidates.status, opts.status ?? 'PENDING_REVIEW')];
  if (cursorData) {
    conditions.push(
      sql`(${eventMatchCandidates.createdAt}, ${eventMatchCandidates.id}) > (${cursorData.createdAt}::timestamptz, ${cursorData.id})`,
    );
  }

  const rows = await db
    .select({
      id: eventMatchCandidates.id,
      status: eventMatchCandidates.status,
      incomingTitle: eventMatchCandidates.incomingTitle,
      incomingDate: eventMatchCandidates.incomingDate,
      incomingVenueName: eventMatchCandidates.incomingVenueName,
      incomingArtists: eventMatchCandidates.incomingArtists,
      incomingSource: incomingEvents.sourceType,
      candidateId: events.id,
      candidateTitle: events.title,
      candidateStartsAt: events.startsAt,
      candidateVenueId: venues.id,
      candidateVenueName: venues.name,
      candidateVenueCity: venues.city,
      score: eventMatchCandidates.score,
      venueScore: eventMatchCandidates.venueScore,
      dateScore: eventMatchCandidates.dateScore,
      titleScore: eventMatchCandidates.titleScore,
      artistScore: eventMatchCandidates.artistScore,
      matchDetails: eventMatchCandidates.matchDetails,
      createdAt: eventMatchCandidates.createdAt,
    })
    .from(eventMatchCandidates)
    .innerJoin(events, eq(events.id, eventMatchCandidates.candidateEventId))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .leftJoin(incomingEvents, eq(incomingEvents.id, eventMatchCandidates.incomingEventId))
    .where(and(...conditions))
    .orderBy(asc(eventMatchCandidates.createdAt), asc(eventMatchCandidates.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const candidateIds = page.map((row) => row.candidateId);
  const artistRows =
    candidateIds.length === 0
      ? []
      : await db
          .select({ eventId: eventArtists.eventId, name: artists.name })
          .from(eventArtists)
          .innerJoin(artists, eq(artists.id, eventArtists.artistId))
          .where(inArray(eventArtists.eventId, candidateIds))
          .orderBy(asc(eventArtists.sortOrder));
  const artistsByEvent = new Map<string, string[]>();
  for (const row of artistRows) {
    artistsByEvent.set(row.eventId, [...(artistsByEvent.get(row.eventId) ?? []), row.name]);
  }

  const data: DedupCandidateItem[] = page.map((row) => ({
    id: row.id,
    status: row.status,
    incoming: {
      title: row.incomingTitle,
      startsAt: row.incomingDate,
      venueName: row.incomingVenueName,
      artists: row.incomingArtists ?? [],
      sourceType: row.incomingSource,
    },
    candidate: {
      id: row.candidateId,
      title: row.candidateTitle,
      startsAt: row.candidateStartsAt,
      venue: row.candidateVenueId
        ? { id: row.candidateVenueId, name: row.candidateVenueName!, city: row.candidateVenueCity! }
        : null,
      artists: artistsByEvent.get(row.candidateId) ?? [],
    },
    score: row.score,
    venueScore: row.venueScore,
    dateScore: row.dateScore,
    titleScore: row.titleScore,
    artistScore: row.artistScore,
    matchDetails: row.matchDetails,
    createdAt: row.createdAt,
  }));

  const last = page[page.length - 1];
  const cursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null;

  return { data, cursor };
}

/**
 * Applies an admin decision to a REVIEW-band match: "merge" folds the incoming record into the
 * candidate event, "reject" creates a new canonical event from it. One locked transaction, so a
 * double-click or two admins can't resolve the same candidate twice.
 */
export async function resolveCandidate(
  candidateId: string,
  action: 'merge' | 'reject',
  adminId: string,
): Promise<ResolvedCandidate> {
  return db.transaction(async (tx) => {
    await acquireDedupLock(tx);

    const [candidate] = await tx
      .select()
      .from(eventMatchCandidates)
      .where(eq(eventMatchCandidates.id, candidateId))
      .limit(1);
    if (!candidate) throw new NotFoundError('Match candidate not found');
    if (candidate.status !== 'PENDING_REVIEW') {
      throw new ConflictError('Match candidate has already been resolved');
    }

    const [incoming] = candidate.incomingEventId
      ? await tx
          .select()
          .from(incomingEvents)
          .where(eq(incomingEvents.id, candidate.incomingEventId))
          .limit(1)
      : [];
    const normalized = incoming?.normalizedData as NormalizedEvent | null | undefined;
    if (!incoming || !normalized) {
      throw new ConflictError('The incoming record for this match is no longer available');
    }

    const source = {
      sourceType: incoming.sourceType,
      externalId: incoming.externalId ?? normalized.externalId,
      rawData: incoming.rawData,
    };
    const venueId = await resolveVenue(tx, normalized, source.sourceType);

    let resultEventId: string;
    let status: DedupMatchStatus;
    if (action === 'merge') {
      await mergeIntoEvent(tx, candidate.candidateEventId, normalized, source, venueId);
      resultEventId = candidate.candidateEventId;
      status = 'MANUAL_MERGED';
    } else {
      resultEventId = await createCanonicalEvent(tx, normalized, source, venueId);
      status = 'REJECTED';
    }

    const reviewedAt = new Date();
    await tx
      .update(incomingEvents)
      .set({ matchedEventId: resultEventId })
      .where(eq(incomingEvents.id, incoming.id));
    await tx
      .update(eventMatchCandidates)
      .set({ status, reviewedBy: adminId, reviewedAt })
      .where(eq(eventMatchCandidates.id, candidateId));
    await logAdminAction(tx, {
      adminId,
      action: action === 'merge' ? 'dedup_merge' : 'dedup_reject',
      targetType: 'event_match_candidate',
      targetId: candidateId,
      details: {
        candidateEventId: candidate.candidateEventId,
        incomingEventId: incoming.id,
        resultEventId,
        score: candidate.score,
      },
    });

    return { id: candidateId, status, resultEventId, reviewedBy: adminId, reviewedAt };
  });
}
