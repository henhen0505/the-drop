import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/db/client', () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock('../../../../src/integrations/ticketmaster', () => ({ fetchAllEvents: vi.fn() }));
vi.mock('../../../../src/dedup/processor', () => ({ processPendingBatch: vi.fn() }));

import { db } from '../../../../src/db/client';
import { syncStatus } from '../../../../src/db/schema/admin';
import { incomingEvents } from '../../../../src/db/schema/event-sources';
import { fetchAllEvents } from '../../../../src/integrations/ticketmaster';
import { processPendingBatch } from '../../../../src/dedup/processor';
import {
  TM_TARGET_STATES,
  getSyncStatus,
  syncTicketmaster,
} from '../../../../src/modules/admin/sync.service';
import { fakeChain, insertsInto, stepArg } from '../../../helpers/fake-db';
import type { RecordedOp } from '../../../helpers/fake-db';

/** Non-transactional analog of tests/helpers/fake-db.ts's createFakeTx, for code that calls
 * db.select()/db.insert() directly rather than inside a db.transaction() callback. */
function queueDb(selectResults: unknown[] = [], insertResults: unknown[] = []): RecordedOp[] {
  const ops: RecordedOp[] = [];
  const selectQueue = [...selectResults];
  const insertQueue = [...insertResults];

  vi.mocked(db.select).mockImplementation((...args: unknown[]) => {
    const op: RecordedOp = { root: 'select', steps: [{ name: 'select', args }] };
    ops.push(op);
    return fakeChain(() => (selectQueue.length > 0 ? selectQueue.shift() : []), op.steps) as never;
  });
  vi.mocked(db.insert).mockImplementation((...args: unknown[]) => {
    const op: RecordedOp = { root: 'insert', steps: [{ name: 'insert', args }] };
    ops.push(op);
    return fakeChain(() => (insertQueue.length > 0 ? insertQueue.shift() : []), op.steps) as never;
  });
  return ops;
}

function rawEvent(id: string) {
  return { id, name: `Event ${id}`, dates: { start: { dateTime: '2024-10-01T00:00:00Z' } } };
}

describe('syncTicketmaster', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('stages events, drains the dedup pipeline, and records success', async () => {
    vi.mocked(fetchAllEvents).mockImplementation(async ({ stateCode }) =>
      stateCode === TM_TARGET_STATES[0] ? [rawEvent('tm-1'), rawEvent('tm-2')] : [],
    );
    const ops = queueDb([[], []]);
    vi.mocked(processPendingBatch)
      .mockResolvedValueOnce({ processed: 2, failed: 0, skipped: 0 })
      .mockResolvedValueOnce({ processed: 0, failed: 0, skipped: 0 });

    const result = await syncTicketmaster();

    expect(result).toEqual({ eventsStaged: 2, eventsProcessed: 2, eventsFailed: 0, eventsSkipped: 0 });
    expect(fetchAllEvents).toHaveBeenCalledTimes(TM_TARGET_STATES.length);

    const staged = insertsInto(ops, incomingEvents);
    expect(staged).toHaveLength(2);
    expect(stepArg(staged[0]!, 'values')).toMatchObject({
      sourceType: 'TICKETMASTER',
      externalId: 'tm-1',
      status: 'PENDING',
    });

    const statusUpsert = insertsInto(ops, syncStatus);
    expect(statusUpsert).toHaveLength(1);
    expect(stepArg(statusUpsert[0]!, 'values')).toMatchObject({
      sourceType: 'TICKETMASTER',
      eventsSynced: 2,
      lastError: null,
    });
  });

  it('skips staging when a PENDING row already exists for the same external ID', async () => {
    vi.mocked(fetchAllEvents).mockImplementation(async ({ stateCode }) =>
      stateCode === TM_TARGET_STATES[0] ? [rawEvent('tm-dup')] : [],
    );
    const ops = queueDb([[{ id: 'existing-pending' }]]);
    vi.mocked(processPendingBatch).mockResolvedValueOnce({ processed: 0, failed: 0, skipped: 0 });

    const result = await syncTicketmaster();

    expect(result).toEqual({ eventsStaged: 0, eventsProcessed: 0, eventsFailed: 0, eventsSkipped: 1 });
    expect(insertsInto(ops, incomingEvents)).toHaveLength(0);
  });

  it('handles an empty result set across every state', async () => {
    vi.mocked(fetchAllEvents).mockResolvedValue([]);
    const ops = queueDb([]);
    vi.mocked(processPendingBatch).mockResolvedValueOnce({ processed: 0, failed: 0, skipped: 0 });

    const result = await syncTicketmaster();

    expect(result).toEqual({ eventsStaged: 0, eventsProcessed: 0, eventsFailed: 0, eventsSkipped: 0 });
    expect(insertsInto(ops, incomingEvents)).toHaveLength(0);
    const statusUpsert = insertsInto(ops, syncStatus);
    expect(stepArg(statusUpsert[0]!, 'values')).toMatchObject({ eventsSynced: 0 });
  });

  it('records the failure in sync_status and re-throws, keeping any events staged before the failure', async () => {
    vi.mocked(fetchAllEvents).mockImplementation(async ({ stateCode }) => {
      if (stateCode === TM_TARGET_STATES[0]) return [rawEvent('tm-1')];
      if (stateCode === TM_TARGET_STATES[1]) throw new Error('Ticketmaster API error: 500 on events.json');
      return [];
    });
    const ops = queueDb([[]]);

    await expect(syncTicketmaster()).rejects.toThrow('Ticketmaster API error: 500');

    expect(insertsInto(ops, incomingEvents)).toHaveLength(1);
    const statusUpsert = insertsInto(ops, syncStatus);
    expect(statusUpsert).toHaveLength(1);
    expect(stepArg(statusUpsert[0]!, 'values')).toMatchObject({
      sourceType: 'TICKETMASTER',
      lastError: 'Ticketmaster API error: 500 on events.json',
    });
    expect(processPendingBatch).not.toHaveBeenCalled();
  });
});

describe('getSyncStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns whatever rows exist', async () => {
    vi.mocked(db.select).mockReturnValue(fakeChain([{ sourceType: 'TICKETMASTER' }]) as never);

    await expect(getSyncStatus()).resolves.toEqual([{ sourceType: 'TICKETMASTER' }]);
  });

  it('returns an empty array when nothing has ever synced', async () => {
    vi.mocked(db.select).mockReturnValue(fakeChain([]) as never);

    await expect(getSyncStatus()).resolves.toEqual([]);
  });
});
