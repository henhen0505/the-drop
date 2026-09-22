import { and, asc, eq } from 'drizzle-orm';
import type { SourceType } from '@the-drop/types';
import { db } from '../db/client';
import { eventMatchCandidates } from '../db/schema/dedup';
import { eventExternalIds, incomingEvents } from '../db/schema/event-sources';
import { logger } from '../utils/logger';
import { findCandidates } from './candidate-finder';
import { DEDUP_WEIGHTS, getDedupSettings } from './config';
import { decide } from './decision';
import { extractEvent, validateNormalized } from './extractors';
import { acquireDedupLock } from './lock';
import { createCanonicalEvent, mergeIntoEvent } from './merger';
import { scoreCandidates } from './scorer';
import { resolveVenue } from './venue-matcher';
import type {
  DbTx,
  DecisionReason,
  DedupResult,
  DedupSettings,
  MatchDecision,
  NormalizedEvent,
} from './types';

const SKIPPED = (incomingId: string): DedupResult => ({
  incomingId,
  status: 'SKIPPED',
  decision: null,
  reason: null,
  matchedEventId: null,
  score: null,
});

/** Runs one staged event through the pipeline inside the caller's transaction (no failure marking). */
export async function processInTransaction(
  tx: DbTx,
  incomingId: string,
  settings: DedupSettings,
): Promise<DedupResult> {
  await acquireDedupLock(tx);

  const [row] = await tx
    .select()
    .from(incomingEvents)
    .where(eq(incomingEvents.id, incomingId))
    .limit(1);
  if (!row || row.status !== 'PENDING') return SKIPPED(incomingId);

  const sourceType = row.sourceType as SourceType;
  const normalized = extractEvent(sourceType, row.rawData);
  const problem = validateNormalized(normalized);
  if (problem) throw new Error(`Invalid incoming event: ${problem}`);

  const source = {
    sourceType,
    externalId: row.externalId ?? normalized.externalId,
    rawData: row.rawData,
  };

  const finish = async (
    decision: MatchDecision,
    reason: DecisionReason,
    matchedEventId: string | null,
    score: number | null,
  ): Promise<DedupResult> => {
    await tx
      .update(incomingEvents)
      .set({
        normalizedData: normalized,
        status: 'PROCESSED',
        matchedEventId,
        matchScore: score,
        matchDecision: decision,
        processedAt: new Date(),
      })
      .where(eq(incomingEvents.id, incomingId));
    return { incomingId, status: 'PROCESSED', decision, reason, matchedEventId, score };
  };

  if (source.externalId) {
    const [known] = await tx
      .select({ eventId: eventExternalIds.eventId })
      .from(eventExternalIds)
      .where(
        and(
          eq(eventExternalIds.sourceType, sourceType),
          eq(eventExternalIds.externalId, source.externalId),
        ),
      )
      .limit(1);
    if (known) {
      const venueId = await resolveVenue(tx, normalized, sourceType);
      await mergeIntoEvent(tx, known.eventId, normalized, source, venueId);
      return finish('AUTO_MERGE', 'EXTERNAL_ID_MATCH', known.eventId, null);
    }

    // A re-sync of a listing that is still awaiting admin review must not queue a second candidate.
    const [queued] = await tx
      .select({ score: eventMatchCandidates.score })
      .from(eventMatchCandidates)
      .innerJoin(incomingEvents, eq(incomingEvents.id, eventMatchCandidates.incomingEventId))
      .where(
        and(
          eq(incomingEvents.sourceType, sourceType),
          eq(incomingEvents.externalId, source.externalId),
          eq(eventMatchCandidates.status, 'PENDING_REVIEW'),
        ),
      )
      .limit(1);
    if (queued) {
      return finish('REVIEW', 'ALREADY_QUEUED', null, queued.score);
    }
  }

  const scored = scoreCandidates(normalized, await findCandidates(tx, normalized));
  const top = scored[0];
  const { decision, reason } = decide(top, sourceType, settings);
  const score = top?.scores.composite ?? null;

  if (decision === 'REVIEW' && top) {
    await tx.insert(eventMatchCandidates).values({
      incomingEventId: incomingId,
      incomingTitle: normalized.title,
      incomingDate: new Date(normalized.startsAt),
      incomingVenueName: normalized.venueName,
      incomingArtists: normalized.artistNames,
      candidateEventId: top.candidate.eventId,
      score: top.scores.composite,
      venueScore: top.scores.venueScore,
      dateScore: top.scores.dateScore,
      titleScore: top.scores.titleScore,
      artistScore: top.scores.artistScore,
      matchDetails: {
        reason,
        weights: DEDUP_WEIGHTS,
        settings,
        incomingSource: sourceType,
        candidateSources: top.candidate.sourceTypes,
      },
    });
    return finish('REVIEW', reason, null, score);
  }

  const venueId = await resolveVenue(tx, normalized, sourceType);
  if (decision === 'AUTO_MERGE' && top) {
    await mergeIntoEvent(tx, top.candidate.eventId, normalized, source, venueId);
    return finish('AUTO_MERGE', reason, top.candidate.eventId, score);
  }

  const eventId = await createCanonicalEvent(tx, normalized, source, venueId);
  return finish('NO_MATCH', reason, eventId, score);
}

async function markFailed(incomingId: string, message: string): Promise<void> {
  try {
    await db
      .update(incomingEvents)
      .set({ status: 'FAILED', error: message, processedAt: new Date() })
      .where(and(eq(incomingEvents.id, incomingId), eq(incomingEvents.status, 'PENDING')));
  } catch (err) {
    logger.error({ err, incomingId }, 'dedup: could not record failure');
  }
}

/**
 * Runs one staged event through normalize -> external-ID fast path -> candidates -> score ->
 * decision, atomically. A failure rolls back every write and marks the staging row FAILED.
 */
export async function processIncomingEvent(
  incomingId: string,
  settings: DedupSettings = getDedupSettings(),
): Promise<DedupResult> {
  try {
    return await db.transaction((tx) => processInTransaction(tx, incomingId, settings));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, incomingId }, 'dedup: processing failed');
    await markFailed(incomingId, message);
    return { ...SKIPPED(incomingId), status: 'FAILED', error: message };
  }
}

export async function processPendingBatch(
  batchSize = 50,
): Promise<{ processed: number; failed: number; skipped: number }> {
  const pending = await db
    .select({ id: incomingEvents.id })
    .from(incomingEvents)
    .where(eq(incomingEvents.status, 'PENDING'))
    .orderBy(asc(incomingEvents.createdAt))
    .limit(batchSize);

  const tally = { processed: 0, failed: 0, skipped: 0 };
  for (const { id } of pending) {
    const result = await processIncomingEvent(id);
    if (result.status === 'PROCESSED') tally.processed++;
    else if (result.status === 'FAILED') tally.failed++;
    else tally.skipped++;
  }
  return tally;
}

export type { NormalizedEvent };
