import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));
vi.mock('../../../../src/dedup/lock', () => ({ acquireDedupLock: vi.fn() }));

import { db } from '../../../../src/db/client';
import { adminAuditLog } from '../../../../src/db/schema/admin';
import { eventMatchCandidates } from '../../../../src/db/schema/dedup';
import { eventExternalIds, eventSources, incomingEvents } from '../../../../src/db/schema/event-sources';
import { eventArtists, eventGenres, events } from '../../../../src/db/schema/events';
import { communitySubmissions } from '../../../../src/db/schema/submissions';
import { ticketLinks } from '../../../../src/db/schema/ticket-links';
import { userEventStates } from '../../../../src/db/schema/user-event-states';
import { acquireDedupLock } from '../../../../src/dedup/lock';
import { mergeEvents } from '../../../../src/modules/admin/event-merge.service';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';
import {
  installFakeDb,
  selectedKeys,
  stepArg,
  tableOf,
  whereOf,
  type OpResolver,
  type RecordedOp,
} from '../../../helpers/fake-db';

const dialect = new PgDialect();
const ADMIN = 'admin-1';
const KEEP = '11111111-1111-4111-8111-111111111111';
const MERGE = '22222222-2222-4222-8222-222222222222';
const A1 = '00000000-0000-4000-8000-0000000000a1';
const A2 = '00000000-0000-4000-8000-0000000000a2';
const A3 = '00000000-0000-4000-8000-0000000000a3';
const G1 = '00000000-0000-4000-8000-0000000000b1';

function eventRow(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: id === KEEP ? 'Knock2 at Brooklyn Mirage' : 'KNOCK2 -- NYC',
    slug: id === KEEP ? 'knock2-mirage' : 'knock2-nyc',
    description: id === KEEP ? null : 'Bass all night.',
    imageUrl: null,
    startsAt: new Date('2026-10-17T22:00:00Z'),
    endsAt: null,
    timezone: 'America/New_York',
    venueId: null,
    status: 'PUBLISHED',
    ageRestriction: null,
    doorTime: null,
    reentryPolicy: null,
    bagPolicy: null,
    prohibitedItems: null,
    dressCode: null,
    primarySource: 'TICKETMASTER',
    confidence: 'TRUSTED_SOURCE',
    fieldProvenance: { title: 'TICKETMASTER' },
    minPriceCents: null,
    artistCount: 0,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

interface World {
  keep?: Record<string, unknown> | null;
  merged?: Record<string, unknown> | null;
  keptArtists?: Array<{ artistId: string; sortOrder: number }>;
  mergedArtists?: string[];
  mergedGenres?: string[];
  mergedStates?: Array<{ userId: string; state: string; createdAt: Date }>;
}

function world(w: World): OpResolver {
  return (op) => {
    if (op.root !== 'select') return undefined;
    const table = tableOf(op);
    const keys = selectedKeys(op);

    if (table === events) {
      if (keys.includes('event')) {
        const detail = w.keep === undefined ? eventRow(KEEP) : w.keep;
        return detail
          ? [{ event: detail, venueId: null, venueName: null, venueSlug: null, venueCity: null, venueState: null }]
          : [];
      }
      const params = whereOf(op, dialect).params;
      if (params.includes(KEEP)) return w.keep === undefined ? [eventRow(KEEP)] : w.keep ? [w.keep] : [];
      if (params.includes(MERGE)) return w.merged === undefined ? [eventRow(MERGE)] : w.merged ? [w.merged] : [];
      return [];
    }
    if (table === eventArtists) {
      if (keys.includes('eventId')) return [];
      if (keys.includes('sortOrder')) return w.keptArtists ?? [];
      return (w.mergedArtists ?? []).map((artistId) => ({ artistId }));
    }
    if (table === eventGenres) {
      return keys.includes('genreId') ? (w.mergedGenres ?? []).map((genreId) => ({ genreId })) : [];
    }
    if (table === userEventStates) return w.mergedStates ?? [];
    return undefined;
  };
}

let ops: RecordedOp[] = [];

function useWorld(w: World): void {
  ops = installFakeDb(db as never, [], world(w)).ops;
}

function writes(root: 'insert' | 'update' | 'delete', table: unknown): RecordedOp[] {
  return ops.filter((op) => op.root === root && op.steps[0]?.args[0] === table);
}

function setOf(op: RecordedOp | undefined): Record<string, unknown> {
  return stepArg(op!, 'set') as Record<string, unknown>;
}

function valuesOf(op: RecordedOp | undefined): unknown {
  return stepArg(op!, 'values');
}

function keepUpdate(): RecordedOp {
  return writes('update', events)[0]!;
}

describe('mergeEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serializes on the dedup lock so it cannot interleave with ingestion', async () => {
    useWorld({});

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    expect(acquireDedupLock).toHaveBeenCalledOnce();
  });

  it('404s when either event is missing, changing nothing', async () => {
    useWorld({ keep: null });
    await expect(mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE })).rejects.toThrow('Event to keep was not found');

    useWorld({ merged: null });
    await expect(mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE })).rejects.toBeInstanceOf(NotFoundError);
    expect(writes('delete', events)).toHaveLength(0);
    expect(writes('update', eventSources)).toHaveLength(0);
  });

  it('redirects every row that belonged to the merged event onto the kept event', async () => {
    useWorld({});

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    const redirected: Array<[unknown, string]> = [
      [eventSources, 'eventId'],
      [eventExternalIds, 'eventId'],
      [ticketLinks, 'eventId'],
      [eventMatchCandidates, 'candidateEventId'],
      [incomingEvents, 'matchedEventId'],
      [communitySubmissions, 'mergedEventId'],
    ];
    for (const [table, column] of redirected) {
      const [op] = writes('update', table);
      expect(setOf(op), column).toEqual({ [column]: KEEP });
      expect(whereOf(op, dialect).params, column).toEqual([MERGE]);
    }
  });

  it('moves the two non-cascading references before deleting the merged event', async () => {
    useWorld({});

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    const indexOf = (root: string, table: unknown) =>
      ops.findIndex((op) => op.root === root && op.steps[0]?.args[0] === table);
    const deleteIndex = indexOf('delete', events);
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(indexOf('update', incomingEvents)).toBeLessThan(deleteIndex);
    expect(indexOf('update', communitySubmissions)).toBeLessThan(deleteIndex);
    expect(indexOf('update', eventSources)).toBeLessThan(deleteIndex);
    expect(indexOf('update', ticketLinks)).toBeLessThan(deleteIndex);
    expect(whereOf(ops[deleteIndex], dialect).params).toEqual([MERGE]);
  });

  it('unions artists, appending the merged event\'s new ones after the kept lineup, never as headliner', async () => {
    useWorld({
      keptArtists: [
        { artistId: A1, sortOrder: 0 },
        { artistId: A2, sortOrder: 4 },
      ],
      mergedArtists: [A2, A3],
    });

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    expect(valuesOf(writes('insert', eventArtists)[0])).toEqual([
      { eventId: KEEP, artistId: A3, isHeadliner: false, sortOrder: 5 },
    ]);
    expect(setOf(keepUpdate()).artistCount).toBe(3);
  });

  it('adds nothing when the merged event has no artists the kept one lacks', async () => {
    useWorld({ keptArtists: [{ artistId: A1, sortOrder: 0 }], mergedArtists: [A1] });

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    expect(writes('insert', eventArtists)).toHaveLength(0);
    expect(setOf(keepUpdate()).artistCount).toBe(1);
  });

  it('unions genres and copies saved states, both ignoring rows that already exist', async () => {
    const createdAt = new Date('2026-09-05T00:00:00Z');
    useWorld({ mergedGenres: [G1], mergedStates: [{ userId: 'u1', state: 'GOING', createdAt }] });

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    const [genreInsert] = writes('insert', eventGenres);
    expect(valuesOf(genreInsert)).toEqual([{ eventId: KEEP, genreId: G1 }]);
    expect(genreInsert?.steps.some((s) => s.name === 'onConflictDoNothing')).toBe(true);

    const [stateInsert] = writes('insert', userEventStates);
    expect(valuesOf(stateInsert)).toEqual([{ userId: 'u1', state: 'GOING', createdAt, eventId: KEEP }]);
    expect(stateInsert?.steps.some((s) => s.name === 'onConflictDoNothing')).toBe(true);
  });

  it('skips the genre and state inserts when there is nothing to copy', async () => {
    useWorld({});

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    expect(writes('insert', eventGenres)).toHaveLength(0);
    expect(writes('insert', userEventStates)).toHaveLength(0);
  });

  it('keeps every field of the kept event by default, but recomputes the minimum price from the moved ticket links', async () => {
    useWorld({});

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    const set = setOf(keepUpdate());
    expect(set).not.toHaveProperty('title');
    expect(set).not.toHaveProperty('description');
    expect(set.fieldProvenance).toEqual({ title: 'TICKETMASTER' });
    expect(set.lastVerifiedAt).toBeInstanceOf(Date);
    const { sql } = dialect.sqlToQuery(set.minPriceCents as never);
    expect(sql).toContain('select min("ticket_links"."price_min_cents") from "ticket_links"');
  });

  it('takes a field from the merged event when the admin chose "merge", and stamps it ADMIN', async () => {
    useWorld({});

    await mergeEvents(ADMIN, {
      keepEventId: KEEP,
      mergeEventId: MERGE,
      fieldOverrides: { description: 'merge', title: 'keep', dressCode: 'keep' },
    });

    const set = setOf(keepUpdate());
    expect(set.description).toBe('Bass all night.');
    expect(set).not.toHaveProperty('title');
    expect(set.fieldProvenance).toEqual({ title: 'TICKETMASTER', description: 'ADMIN' });
  });

  it('does not stamp provenance for fields the merge rules never weigh', async () => {
    useWorld({ merged: eventRow(MERGE, { ageRestriction: '21+' }) });

    await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE, fieldOverrides: { ageRestriction: 'merge' } });

    const set = setOf(keepUpdate());
    expect(set.ageRestriction).toBe('21+');
    expect(set.fieldProvenance).toEqual({ title: 'TICKETMASTER' });
  });

  it('refuses a field choice that would leave the end at or before the start', async () => {
    useWorld({
      keep: eventRow(KEEP, { endsAt: new Date('2026-10-18T04:00:00Z') }),
      merged: eventRow(MERGE, { startsAt: new Date('2026-10-18T05:00:00Z') }),
    });

    await expect(
      mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE, fieldOverrides: { startsAt: 'merge' } }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(writes('delete', events)).toHaveLength(0);
  });

  it('records the merge in the audit log, including which fields came from the merged event', async () => {
    useWorld({});

    await mergeEvents(ADMIN, {
      keepEventId: KEEP,
      mergeEventId: MERGE,
      fieldOverrides: { description: 'merge' },
    });

    expect(valuesOf(writes('insert', adminAuditLog)[0])).toMatchObject({
      adminId: ADMIN,
      action: 'merge_events',
      targetType: 'event',
      targetId: KEEP,
      details: {
        mergedEventId: MERGE,
        mergedTitle: 'KNOCK2 -- NYC',
        mergedSlug: 'knock2-nyc',
        fieldsTakenFromMerged: ['description'],
      },
    });
  });

  it('returns the kept event\'s detail after the merge', async () => {
    useWorld({});

    const result = await mergeEvents(ADMIN, { keepEventId: KEEP, mergeEventId: MERGE });

    expect(result.id).toBe(KEEP);
    expect(result.title).toBe('Knock2 at Brooklyn Mirage');
  });
});
