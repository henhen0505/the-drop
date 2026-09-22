import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));

import { db } from '../../../../src/db/client';
import { events } from '../../../../src/db/schema/events';
import { notificationPreferences, notifications } from '../../../../src/db/schema/notifications';
import {
  scanArtistNewEvent,
  scanEventCancelled,
  scanEventRescheduled,
  scanEventTomorrow,
  scanSubmissionUpdates,
} from '../../../../src/modules/notifications/notification-triggers';
import {
  installFakeDb,
  stepArg,
  tableOf,
  whereOf,
  type OpResolver,
  type RecordedOp,
} from '../../../helpers/fake-db';

const dialect = new PgDialect();

interface World {
  mainRows?: Record<string, unknown>[];
  prefsRows?: Record<string, unknown>[];
  existingNotified?: Record<string, unknown>[];
}

function world(w: World): OpResolver {
  return (op) => {
    if (op.root !== 'select') return undefined;
    const table = tableOf(op);
    if (table === notificationPreferences) return w.prefsRows ?? [];
    if (table === notifications) return w.existingNotified ?? [];
    return w.mainRows ?? [];
  };
}

let ops: RecordedOp[] = [];

function useWorld(w: World): void {
  ops = installFakeDb(db as never, [], world(w)).ops;
}

function insertedValues(): Record<string, unknown>[] {
  const op = ops.find((o) => o.root === 'insert' && tableOf(o) === notifications);
  if (!op) return [];
  return stepArg(op, 'values') as Record<string, unknown>[];
}

describe('scanEventTomorrow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a notification for a user with an active state on an event starting within 25 hours', async () => {
    useWorld({ mainRows: [{ userId: 'u1', eventId: 'ev1', title: 'Knock2 Live' }] });

    const count = await scanEventTomorrow();

    expect(count).toBe(1);
    expect(insertedValues()).toEqual([
      expect.objectContaining({ userId: 'u1', type: 'EVENT_TOMORROW', data: { eventId: 'ev1' } }),
    ]);
  });

  it('skips a user who has turned the eventTomorrow preference off', async () => {
    useWorld({
      mainRows: [{ userId: 'u1', eventId: 'ev1', title: 'Knock2 Live' }],
      prefsRows: [
        {
          userId: 'u1',
          eventTomorrow: false,
          eventCancelled: true,
          eventRescheduled: true,
          artistNewEvent: true,
          submissionUpdates: true,
        },
      ],
    });

    const count = await scanEventTomorrow();

    expect(count).toBe(0);
    expect(ops.some((op) => op.root === 'insert')).toBe(false);
  });
});

describe('scanEventCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a notification for a user with an active state on a newly cancelled event', async () => {
    useWorld({ mainRows: [{ userId: 'u1', eventId: 'ev1', title: 'Knock2 Live' }] });

    const count = await scanEventCancelled();

    expect(count).toBe(1);
    expect(insertedValues()).toEqual([
      expect.objectContaining({ userId: 'u1', type: 'EVENT_CANCELLED', data: { eventId: 'ev1' } }),
    ]);
  });

  it('skips a candidate that already has a matching notification', async () => {
    useWorld({
      mainRows: [{ userId: 'u1', eventId: 'ev1', title: 'Knock2 Live' }],
      existingNotified: [{ userId: 'u1', entityId: 'ev1' }],
    });

    const count = await scanEventCancelled();

    expect(count).toBe(0);
    expect(ops.some((op) => op.root === 'insert')).toBe(false);
  });
});

describe('scanEventRescheduled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters on POSTPONED, not any updated PUBLISHED event', async () => {
    useWorld({ mainRows: [] });

    await scanEventRescheduled();

    const mainSelect = ops.find((op) => op.root === 'select' && tableOf(op) === events);
    const where = whereOf(mainSelect, dialect);
    expect(where.params).toContain('POSTPONED');
    expect(where.params).not.toContain('PUBLISHED');
  });

  it('creates a notification for a user with an active state on a postponed event', async () => {
    useWorld({ mainRows: [{ userId: 'u1', eventId: 'ev1', title: 'Knock2 Live' }] });

    const count = await scanEventRescheduled();

    expect(count).toBe(1);
    expect(insertedValues()).toEqual([
      expect.objectContaining({
        userId: 'u1',
        type: 'EVENT_RESCHEDULED',
        data: { eventId: 'ev1' },
      }),
    ]);
  });
});

describe('scanArtistNewEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a notification for a follower of the artist on a newly published event', async () => {
    useWorld({
      mainRows: [
        {
          userId: 'u1',
          eventId: 'ev1',
          eventTitle: 'Knock2 Live',
          artistId: 'a1',
          artistName: 'Knock2',
        },
      ],
    });

    const count = await scanArtistNewEvent();

    expect(count).toBe(1);
    expect(insertedValues()).toEqual([
      expect.objectContaining({
        userId: 'u1',
        type: 'ARTIST_NEW_EVENT',
        data: { eventId: 'ev1', artistId: 'a1' },
      }),
    ]);
  });

  it('sends exactly one notification when a user follows two artists on the same new event', async () => {
    useWorld({
      mainRows: [
        {
          userId: 'u1',
          eventId: 'ev1',
          eventTitle: 'Knock2 b2b Subtronics',
          artistId: 'a1',
          artistName: 'Knock2',
        },
        {
          userId: 'u1',
          eventId: 'ev1',
          eventTitle: 'Knock2 b2b Subtronics',
          artistId: 'a2',
          artistName: 'Subtronics',
        },
      ],
    });

    const count = await scanArtistNewEvent();

    expect(count).toBe(1);
    const values = insertedValues();
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ userId: 'u1', data: { eventId: 'ev1' } });
  });
});

describe('scanSubmissionUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a MERGED submission to SUBMISSION_APPROVED and includes the merged event id', async () => {
    useWorld({
      mainRows: [
        {
          userId: 'u1',
          submissionId: 'sub1',
          status: 'MERGED',
          eventTitle: 'Knock2 Live',
          mergedEventId: 'ev1',
        },
      ],
    });

    const count = await scanSubmissionUpdates();

    expect(count).toBe(1);
    expect(insertedValues()).toEqual([
      expect.objectContaining({
        userId: 'u1',
        type: 'SUBMISSION_APPROVED',
        data: { submissionId: 'sub1', eventId: 'ev1' },
      }),
    ]);
  });

  it('maps a REJECTED submission to SUBMISSION_REJECTED with no event id', async () => {
    useWorld({
      mainRows: [
        {
          userId: 'u1',
          submissionId: 'sub1',
          status: 'REJECTED',
          eventTitle: 'Knock2 Live',
          mergedEventId: null,
        },
      ],
    });

    const count = await scanSubmissionUpdates();

    expect(count).toBe(1);
    expect(insertedValues()).toEqual([
      expect.objectContaining({
        userId: 'u1',
        type: 'SUBMISSION_REJECTED',
        data: { submissionId: 'sub1' },
      }),
    ]);
  });
});
