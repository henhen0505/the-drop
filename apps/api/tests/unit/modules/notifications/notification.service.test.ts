import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));

import { db } from '../../../../src/db/client';
import { notifications } from '../../../../src/db/schema/notifications';
import {
  listNotifications,
  markAllRead,
  markRead,
} from '../../../../src/modules/notifications/notification.service';
import { NotFoundError } from '../../../../src/utils/errors';
import { decodeCursor, encodeCursor } from '../../../../src/utils/pagination';
import {
  installFakeDb,
  selectedKeys,
  tableOf,
  whereOf,
  type OpResolver,
  type RecordedOp,
} from '../../../helpers/fake-db';

const dialect = new PgDialect();
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const NOTIF_ID = '33333333-3333-4333-8333-333333333333';

function notificationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: NOTIF_ID,
    userId: USER_ID,
    type: 'EVENT_TOMORROW',
    title: 'Knock2 is tomorrow',
    body: null,
    data: { eventId: 'event-1' },
    readAt: null,
    createdAt: new Date('2026-09-20T12:00:00Z'),
    ...overrides,
  };
}

interface World {
  rows?: Record<string, unknown>[];
  unreadCount?: number;
  updateReturns?: Record<string, unknown>[];
}

function world(w: World): OpResolver {
  return (op) => {
    const table = tableOf(op);
    if (table !== notifications) return undefined;

    if (op.root === 'select') {
      const keys = selectedKeys(op);
      if (keys.includes('value')) return [{ value: w.unreadCount ?? 0 }];
      return w.rows ?? [];
    }
    if (op.root === 'update') {
      return w.updateReturns ?? [];
    }
    return undefined;
  };
}

let ops: RecordedOp[] = [];

function useWorld(w: World): void {
  ops = installFakeDb(db as never, [], world(w)).ops;
}

describe('listNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns notifications with the unread count computed separately', async () => {
    useWorld({ rows: [notificationRow()], unreadCount: 3 });

    const result = await listNotifications(USER_ID, {});

    expect(result.data).toEqual([
      {
        id: NOTIF_ID,
        type: 'EVENT_TOMORROW',
        title: 'Knock2 is tomorrow',
        body: null,
        data: { eventId: 'event-1' },
        readAt: null,
        createdAt: new Date('2026-09-20T12:00:00Z'),
      },
    ]);
    expect(result.unreadCount).toBe(3);
    expect(result.cursor).toBeNull();
  });

  it('filters to unread only when requested', async () => {
    useWorld({ rows: [] });

    await listNotifications(USER_ID, { unreadOnly: true });

    const selectOp = ops.find((op) => op.root === 'select' && selectedKeys(op).length === 0);
    expect(whereOf(selectOp, dialect).sql).toContain('"notifications"."read_at" is null');
  });

  it('does not filter by read state when unreadOnly is not set', async () => {
    useWorld({ rows: [] });

    await listNotifications(USER_ID, {});

    const selectOp = ops.find((op) => op.root === 'select' && selectedKeys(op).length === 0);
    expect(whereOf(selectOp, dialect).sql).not.toContain('read_at');
  });

  it('pages newest-created-first with a (createdAt, id) cursor', async () => {
    useWorld({
      rows: [notificationRow(), notificationRow({ id: '44444444-4444-4444-8444-444444444444' })],
      unreadCount: 0,
    });

    const result = await listNotifications(USER_ID, { limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(decodeCursor(result.cursor!)).toEqual({
      createdAt: '2026-09-20T12:00:00.000Z',
      id: NOTIF_ID,
    });
  });

  it('resumes strictly before the cursor', async () => {
    useWorld({ rows: [] });

    await listNotifications(USER_ID, {
      cursor: encodeCursor({ createdAt: '2026-09-20T12:00:00.000Z', id: NOTIF_ID }),
    });

    const selectOp = ops.find((op) => op.root === 'select' && selectedKeys(op).length === 0);
    expect(whereOf(selectOp, dialect).sql).toContain(
      '("notifications"."created_at", "notifications"."id") < (',
    );
  });
});

describe('markRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a notification read and scopes the update to the owning user', async () => {
    useWorld({ updateReturns: [{ id: NOTIF_ID }] });

    const result = await markRead(USER_ID, NOTIF_ID);

    expect(result.id).toBe(NOTIF_ID);
    expect(result.readAt).toBeInstanceOf(Date);
    const updateOp = ops.find((op) => op.root === 'update');
    expect(whereOf(updateOp, dialect).params).toEqual([NOTIF_ID, USER_ID]);
  });

  it('404s for a nonexistent notification', async () => {
    useWorld({ updateReturns: [] });

    await expect(markRead(USER_ID, NOTIF_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('404s (not a leak) when the notification belongs to a different user', async () => {
    useWorld({ updateReturns: [] });

    await expect(markRead(OTHER_USER_ID, NOTIF_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('markAllRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the number of notifications marked read', async () => {
    useWorld({ updateReturns: [{ id: NOTIF_ID }, { id: '55555555-5555-4555-8555-555555555555' }] });

    const result = await markAllRead(USER_ID);

    expect(result).toEqual({ markedCount: 2 });
  });

  it('returns 0 when nothing was unread', async () => {
    useWorld({ updateReturns: [] });

    const result = await markAllRead(USER_ID);

    expect(result).toEqual({ markedCount: 0 });
  });
});
