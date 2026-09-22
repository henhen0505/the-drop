import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { syncStatus } from '../../db/schema/admin';
import { incomingEvents } from '../../db/schema/event-sources';
import { fetchAllEvents } from '../../integrations/ticketmaster';
import { processPendingBatch } from '../../dedup/processor';
import { logger } from '../../utils/logger';

// Iterating a fixed list of states (instead of one nationwide query) works around Discovery v2's
// page * size < 1000 truncation ceiling per query. Easy to extend as coverage grows.
export const TM_TARGET_STATES = [
  'NY',
  'CA',
  'NV',
  'CO',
  'FL',
  'IL',
  'TX',
  'PA',
  'MA',
  'AZ',
] as const;

const SYNC_WINDOW_DAYS = 30;
const BATCH_SIZE = 50;

export interface SyncResult {
  eventsStaged: number;
  eventsProcessed: number;
  eventsFailed: number;
  eventsSkipped: number;
}

// The select-then-insert guard below has a TOCTOU race under concurrent sync triggers (no lock
// on this endpoint): two overlapping runs could both miss the same pending row and double-stage
// it. Accepted for MVP -- the dedup pipeline's external-ID fast path (processor.ts) converges
// duplicate PENDING rows for the same externalId onto one canonical event, so the race produces
// redundant processing, not duplicate events.
async function stageEvent(externalId: string | undefined, rawData: unknown): Promise<'staged' | 'skipped'> {
  if (externalId) {
    const [existingPending] = await db
      .select({ id: incomingEvents.id })
      .from(incomingEvents)
      .where(
        and(
          eq(incomingEvents.sourceType, 'TICKETMASTER'),
          eq(incomingEvents.externalId, externalId),
          eq(incomingEvents.status, 'PENDING'),
        ),
      )
      .limit(1);
    if (existingPending) return 'skipped';
  }

  await db.insert(incomingEvents).values({
    sourceType: 'TICKETMASTER',
    externalId: externalId ?? null,
    rawData,
    status: 'PENDING',
  });
  return 'staged';
}

async function recordSuccess(eventsSynced: number): Promise<void> {
  await db
    .insert(syncStatus)
    .values({ sourceType: 'TICKETMASTER', lastSuccessAt: new Date(), eventsSynced, lastError: null })
    .onConflictDoUpdate({
      target: syncStatus.sourceType,
      set: { lastSuccessAt: new Date(), eventsSynced, lastError: null, updatedAt: new Date() },
    });
}

async function recordFailure(message: string): Promise<void> {
  await db
    .insert(syncStatus)
    .values({ sourceType: 'TICKETMASTER', lastFailureAt: new Date(), lastError: message })
    .onConflictDoUpdate({
      target: syncStatus.sourceType,
      set: { lastFailureAt: new Date(), lastError: message, updatedAt: new Date() },
    });
}

/**
 * Pulls Ticketmaster's Music listings for the next 30 days across the target states, stages each
 * as a PENDING incoming_events row, then drains the dedup pipeline until nothing is left pending.
 * The sync_status row is upserted regardless of outcome; a failure is re-thrown after that write so
 * the caller's own error handling still sees it.
 */
export async function syncTicketmaster(): Promise<SyncResult> {
  const result: SyncResult = { eventsStaged: 0, eventsProcessed: 0, eventsFailed: 0, eventsSkipped: 0 };

  try {
    const now = new Date();
    const endDate = new Date(now.getTime() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const startDateTime = now.toISOString();
    const endDateTime = endDate.toISOString();

    for (const stateCode of TM_TARGET_STATES) {
      const rawEvents = await fetchAllEvents({ stateCode, startDateTime, endDateTime });
      for (const raw of rawEvents) {
        const outcome = await stageEvent(raw.id, raw);
        if (outcome === 'staged') result.eventsStaged++;
        else result.eventsSkipped++;
      }
    }

    for (;;) {
      const batch = await processPendingBatch(BATCH_SIZE);
      result.eventsProcessed += batch.processed;
      result.eventsFailed += batch.failed;
      if (batch.processed + batch.failed + batch.skipped === 0) break;
    }

    await recordSuccess(result.eventsStaged);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Ticketmaster sync failed');
    await recordFailure(message);
    throw err;
  }
}

export async function getSyncStatus(): Promise<Array<typeof syncStatus.$inferSelect>> {
  return db.select().from(syncStatus);
}
