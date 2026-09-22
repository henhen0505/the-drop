import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() },
}));

import { db } from '../../../../src/db/client';
import { userEventStates } from '../../../../src/db/schema/user-event-states';
import {
  listMyRaves,
  removeEventState,
  setEventState,
} from '../../../../src/modules/events/user-event-state.service';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';
import { decodeCursor, encodeCursor } from '../../../../src/utils/pagination';
import { createFakeTx, insertsInto, stepArg, type RecordedOp } from '../../../helpers/fake-db';

const dialect = new PgDialect();
const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const EVENT_ID_2 = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

let ops: RecordedOp[] = [];

/** Every db.select/insert/delete call consumes the next queued result, in call order. */
function useFakeDb(results: unknown[]): void {
  const fake = createFakeTx(results);
  ops = fake.ops;
  const target = fake.tx as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const method of ['select', 'insert', 'delete'] as const) {
    vi.mocked(db[method]).mockImplementation(((...args: unknown[]) => target[method]?.(...args)) as never);
  }
}

function render(op: RecordedOp | undefined, step: string): { sql: string; params: unknown[] } {
  const args = op?.steps.find((s) => s.name === step)?.args ?? [];
  const parts = args.map((arg) => dialect.sqlToQuery(arg as SQL));
  return { sql: parts.map((p) => p.sql).join(', '), params: parts.flatMap((p) => p.params) };
}

function raveRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: EVENT_ID,
    title: 'Knock2 at Brooklyn Mirage',
    slug: 'knock2-mirage',
    startsAt: new Date('2026-10-17T22:00:00Z'),
    timezone: 'America/New_York',
    imageUrl: null,
    venueName: 'Brooklyn Mirage',
    venueCity: 'Brooklyn',
    state: 'GOING',
    updatedAt: new Date('2026-09-20T12:00:00Z'),
    ...overrides,
  };
}

describe('setEventState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('404s without writing anything when the event does not exist', async () => {
    useFakeDb([[]]);

    await expect(setEventState(USER_ID, EVENT_ID, 'GOING')).rejects.toBeInstanceOf(NotFoundError);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('does not let a draft event be marked', async () => {
    useFakeDb([[]]);

    await expect(setEventState(USER_ID, EVENT_ID, 'GOING')).rejects.toBeInstanceOf(NotFoundError);
    const where = render(ops[0], 'where');
    expect(where.sql).toContain('"events"."status" <>');
    expect(where.params).toContain('DRAFT');
  });

  it('upserts on the (user, event) primary key and returns the resulting row', async () => {
    const updatedAt = new Date('2026-09-20T12:00:00Z');
    useFakeDb([[{ id: EVENT_ID }], [{ eventId: EVENT_ID, state: 'GOING', updatedAt }]]);

    const result = await setEventState(USER_ID, EVENT_ID, 'GOING');

    expect(result).toEqual({ eventId: EVENT_ID, state: 'GOING', updatedAt });

    const [insert] = insertsInto(ops, userEventStates);
    expect(stepArg(insert!, 'values')).toEqual({ userId: USER_ID, eventId: EVENT_ID, state: 'GOING' });
    const conflict = stepArg(insert!, 'onConflictDoUpdate') as {
      target: unknown[];
      set: { state: string; updatedAt: Date };
    };
    expect(conflict.target).toEqual([userEventStates.userId, userEventStates.eventId]);
    expect(conflict.set.state).toBe('GOING');
    expect(conflict.set.updatedAt).toBeInstanceOf(Date);
  });

  it('changes an existing state instead of failing (same call, different state)', async () => {
    useFakeDb([[{ id: EVENT_ID }], [{ eventId: EVENT_ID, state: 'ATTENDED', updatedAt: new Date() }]]);

    const result = await setEventState(USER_ID, EVENT_ID, 'ATTENDED');

    expect(result.state).toBe('ATTENDED');
    const conflict = stepArg(insertsInto(ops, userEventStates)[0]!, 'onConflictDoUpdate') as {
      set: { state: string };
    };
    expect(conflict.set.state).toBe('ATTENDED');
  });
});

describe('removeEventState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves when a state was removed', async () => {
    useFakeDb([[{ eventId: EVENT_ID }]]);

    await expect(removeEventState(USER_ID, EVENT_ID)).resolves.toBeUndefined();
    const where = render(ops[0], 'where');
    expect(where.params).toEqual([USER_ID, EVENT_ID]);
  });

  it('404s when the user has no state for that event', async () => {
    useFakeDb([[]]);

    await expect(removeEventState(USER_ID, EVENT_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listMyRaves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to upcoming events for the user, excluding drafts', async () => {
    useFakeDb([[]]);

    await listMyRaves(USER_ID, {});

    const where = render(ops[0], 'where');
    expect(where.sql).toContain('"user_event_states"."user_id" =');
    expect(where.params).toContain(USER_ID);
    expect(where.sql).toContain('"events"."starts_at" >= now()');
    expect(where.sql).toContain('"events"."status" <>');
    expect(where.params).toContain('DRAFT');
  });

  it('drops the date filter for upcoming=false', async () => {
    useFakeDb([[]]);

    await listMyRaves(USER_ID, { upcoming: false });

    expect(render(ops[0], 'where').sql).not.toContain('now()');
  });

  it('filters by the requested states', async () => {
    useFakeDb([[]]);

    await listMyRaves(USER_ID, { states: ['GOING', 'HAVE_TICKET'] });

    const where = render(ops[0], 'where');
    expect(where.sql).toContain('"user_event_states"."state" in (');
    expect(where.params).toEqual(expect.arrayContaining(['GOING', 'HAVE_TICKET']));
  });

  it('applies no state filter when none is requested', async () => {
    useFakeDb([[]]);

    await listMyRaves(USER_ID, { states: [] });

    expect(render(ops[0], 'where').sql).not.toContain('"user_event_states"."state" in');
  });

  it('shapes each row per the contract, with the lineup attached', async () => {
    useFakeDb([
      [raveRow()],
      [
        {
          eventId: EVENT_ID,
          id: 'a1',
          name: 'Knock2',
          slug: 'knock2',
          imageUrl: null,
          isHeadliner: true,
          sortOrder: 0,
        },
      ],
    ]);

    const result = await listMyRaves(USER_ID, {});

    expect(result.cursor).toBeNull();
    expect(result.data).toEqual([
      {
        event: {
          id: EVENT_ID,
          title: 'Knock2 at Brooklyn Mirage',
          slug: 'knock2-mirage',
          startsAt: new Date('2026-10-17T22:00:00Z'),
          timezone: 'America/New_York',
          imageUrl: null,
          venue: { name: 'Brooklyn Mirage', city: 'Brooklyn' },
          artists: [{ id: 'a1', name: 'Knock2', slug: 'knock2', imageUrl: null, isHeadliner: true }],
        },
        state: 'GOING',
        updatedAt: new Date('2026-09-20T12:00:00Z'),
      },
    ]);
  });

  it('gives an event with no venue a null venue', async () => {
    useFakeDb([[raveRow({ venueName: null, venueCity: null })], []]);

    const result = await listMyRaves(USER_ID, {});

    expect(result.data[0]?.event.venue).toBeNull();
    expect(result.data[0]?.event.artists).toEqual([]);
  });

  it('skips the lineup query entirely when there are no rows', async () => {
    useFakeDb([[]]);

    await expect(listMyRaves(USER_ID, {})).resolves.toEqual({ data: [], cursor: null });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('pages with a (startsAt, eventId) cursor when more rows remain', async () => {
    useFakeDb([
      [
        raveRow({ eventId: EVENT_ID, startsAt: new Date('2026-10-17T22:00:00Z') }),
        raveRow({ eventId: EVENT_ID_2, startsAt: new Date('2026-10-18T22:00:00Z') }),
      ],
      [],
    ]);

    const result = await listMyRaves(USER_ID, { limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.event.id).toBe(EVENT_ID);
    expect(decodeCursor(result.cursor!)).toEqual({
      startsAt: '2026-10-17T22:00:00.000Z',
      id: EVENT_ID,
    });
    expect(stepArg(ops[0]!, 'limit')).toBe(2);
  });

  it('resumes strictly after the cursor', async () => {
    useFakeDb([[]]);

    await listMyRaves(USER_ID, {
      cursor: encodeCursor({ startsAt: '2026-10-17T22:00:00.000Z', id: EVENT_ID }),
    });

    const where = render(ops[0], 'where');
    expect(where.sql).toContain('("events"."starts_at", "events"."id") > (');
    expect(where.params).toEqual(expect.arrayContaining(['2026-10-17T22:00:00.000Z', EVENT_ID]));
  });

  it('rejects a malformed cursor', async () => {
    useFakeDb([[]]);

    await expect(listMyRaves(USER_ID, { cursor: 'not-a-cursor' })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      listMyRaves(USER_ID, { cursor: encodeCursor({ startsAt: 'nope', id: EVENT_ID }) }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      listMyRaves(USER_ID, { cursor: encodeCursor({ startsAt: '2026-10-17T22:00:00.000Z', id: 'x' }) }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.select).not.toHaveBeenCalled();
  });
});
