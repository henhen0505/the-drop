import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { eventMatchCandidates } from '../../db/schema/dedup';
import { eventExternalIds, eventSources, incomingEvents } from '../../db/schema/event-sources';
import { eventArtists, eventGenres, events } from '../../db/schema/events';
import { communitySubmissions } from '../../db/schema/submissions';
import { ticketLinks } from '../../db/schema/ticket-links';
import { userEventStates } from '../../db/schema/user-event-states';
import { acquireDedupLock } from '../../dedup/lock';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { logAdminAction } from './audit';
import {
  PROVENANCE_TRACKED_FIELDS,
  getAdminEvent,
  type AdminEventDetail,
} from './admin-event.service';
import type { MergeEventsInput } from './admin-event.validation';

/**
 * Admin-initiated merge of two canonical events (architecture/dedup-engine.md "Manual Merge"): the
 * event being merged in is folded into the one being kept and then deleted. Its sources, external IDs,
 * ticket links, saved states and pending review candidates are redirected to the kept event, artists
 * and genres are unioned, and any field the admin marked "merge" takes the merged event's value.
 * One transaction on the dedup lock, so it can't interleave with the ingestion pipeline.
 */
export async function mergeEvents(adminId: string, input: MergeEventsInput): Promise<AdminEventDetail> {
  const { keepEventId, mergeEventId } = input;

  await db.transaction(async (tx) => {
    await acquireDedupLock(tx);

    const [keep] = await tx.select().from(events).where(eq(events.id, keepEventId)).limit(1);
    if (!keep) {
      throw new NotFoundError('Event to keep was not found');
    }
    const [merged] = await tx.select().from(events).where(eq(events.id, mergeEventId)).limit(1);
    if (!merged) {
      throw new NotFoundError('Event to merge was not found');
    }

    const columns: Record<string, unknown> = {};
    const provenance = { ...((keep.fieldProvenance ?? {}) as Record<string, string>) };
    const takenFromMerged: string[] = [];
    const mergedRow = merged as Record<string, unknown>;
    for (const [field, choice] of Object.entries(input.fieldOverrides ?? {})) {
      if (choice !== 'merge') continue;
      columns[field] = mergedRow[field];
      takenFromMerged.push(field);
      if (PROVENANCE_TRACKED_FIELDS.has(field)) provenance[field] = 'ADMIN';
    }

    const startsAt = (columns.startsAt as Date | undefined) ?? keep.startsAt;
    const endsAt = 'endsAt' in columns ? (columns.endsAt as Date | null) : keep.endsAt;
    if (endsAt && endsAt <= startsAt) {
      throw new ValidationError('The chosen fields would leave endsAt at or before startsAt', {
        field: 'fieldOverrides',
      });
    }

    // Rows that simply change owner.
    await tx.update(eventSources).set({ eventId: keepEventId }).where(eq(eventSources.eventId, mergeEventId));
    await tx
      .update(eventExternalIds)
      .set({ eventId: keepEventId })
      .where(eq(eventExternalIds.eventId, mergeEventId));
    await tx.update(ticketLinks).set({ eventId: keepEventId }).where(eq(ticketLinks.eventId, mergeEventId));
    await tx
      .update(eventMatchCandidates)
      .set({ candidateEventId: keepEventId })
      .where(eq(eventMatchCandidates.candidateEventId, mergeEventId));
    // These two foreign keys don't cascade, so they must be repointed before the delete below.
    await tx
      .update(incomingEvents)
      .set({ matchedEventId: keepEventId })
      .where(eq(incomingEvents.matchedEventId, mergeEventId));
    await tx
      .update(communitySubmissions)
      .set({ mergedEventId: keepEventId })
      .where(eq(communitySubmissions.mergedEventId, mergeEventId));

    // Artists: union, keeping the kept event's billing order and appending new names after it.
    const keptArtists = await tx
      .select({ artistId: eventArtists.artistId, sortOrder: eventArtists.sortOrder })
      .from(eventArtists)
      .where(eq(eventArtists.eventId, keepEventId));
    const mergedArtists = await tx
      .select({ artistId: eventArtists.artistId })
      .from(eventArtists)
      .where(eq(eventArtists.eventId, mergeEventId))
      .orderBy(asc(eventArtists.sortOrder));
    const keptArtistIds = new Set(keptArtists.map((row) => row.artistId));
    let nextSortOrder = keptArtists.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);
    const newArtists = mergedArtists.filter((row) => !keptArtistIds.has(row.artistId));
    if (newArtists.length > 0) {
      await tx.insert(eventArtists).values(
        newArtists.map((row) => ({
          eventId: keepEventId,
          artistId: row.artistId,
          isHeadliner: false,
          sortOrder: nextSortOrder++,
        })),
      );
    }

    const mergedGenres = await tx
      .select({ genreId: eventGenres.genreId })
      .from(eventGenres)
      .where(eq(eventGenres.eventId, mergeEventId));
    if (mergedGenres.length > 0) {
      await tx
        .insert(eventGenres)
        .values(mergedGenres.map((row) => ({ eventId: keepEventId, genreId: row.genreId })))
        .onConflictDoNothing();
    }

    // Saved states: a user who marked both keeps the state they set on the kept event.
    const mergedStates = await tx
      .select({
        userId: userEventStates.userId,
        state: userEventStates.state,
        createdAt: userEventStates.createdAt,
      })
      .from(userEventStates)
      .where(eq(userEventStates.eventId, mergeEventId));
    if (mergedStates.length > 0) {
      await tx
        .insert(userEventStates)
        .values(mergedStates.map((row) => ({ ...row, eventId: keepEventId })))
        .onConflictDoNothing();
    }

    await tx
      .update(events)
      .set({
        ...(columns as Partial<typeof events.$inferInsert>),
        fieldProvenance: provenance,
        artistCount: keptArtistIds.size + newArtists.length,
        minPriceCents: sql`(select min(${ticketLinks.priceMinCents}) from ${ticketLinks} where ${ticketLinks.eventId} = ${keepEventId})`,
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(events.id, keepEventId));

    // Everything that mattered has moved; what's left (its own artist/genre/state rows) cascades away.
    await tx.delete(events).where(eq(events.id, mergeEventId));

    await logAdminAction(tx, {
      adminId,
      action: 'merge_events',
      targetType: 'event',
      targetId: keepEventId,
      details: {
        mergedEventId: mergeEventId,
        mergedTitle: merged.title,
        mergedSlug: merged.slug,
        fieldsTakenFromMerged: takenFromMerged,
      },
    });
  });

  return getAdminEvent(keepEventId);
}
