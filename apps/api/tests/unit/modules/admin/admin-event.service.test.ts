import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));

import { db } from '../../../../src/db/client';
import { adminAuditLog } from '../../../../src/db/schema/admin';
import { artists } from '../../../../src/db/schema/artists';
import { eventSources, incomingEvents } from '../../../../src/db/schema/event-sources';
import { eventArtists, eventGenres, events } from '../../../../src/db/schema/events';
import { genres } from '../../../../src/db/schema/genres';
import { communitySubmissions } from '../../../../src/db/schema/submissions';
import { venues } from '../../../../src/db/schema/venues';
import {
  createAdminEvent,
  deleteAdminEvent,
  getAdminEvent,
  listAdminEvents,
  updateAdminEvent,
} from '../../../../src/modules/admin/admin-event.service';
import type {
  CreateAdminEventInput,
  UpdateAdminEventInput,
} from '../../../../src/modules/admin/admin-event.validation';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';
import { decodeCursor, encodeCursor } from '../../../../src/utils/pagination';
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
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const NEW_ID = '44444444-4444-4444-8444-444444444444';
const VENUE_ID = '22222222-2222-4222-8222-222222222222';
const A1 = '00000000-0000-4000-8000-0000000000a1';
const A2 = '00000000-0000-4000-8000-0000000000a2';
const G1 = '00000000-0000-4000-8000-0000000000b1';
const G2 = '00000000-0000-4000-8000-0000000000b2';

function eventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: EVENT_ID,
    title: 'Knock2 at Brooklyn Mirage',
    slug: 'knock2-at-brooklyn-mirage-2026-10-17',
    description: null,
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
    sourceUrl: null,
    lastVerifiedAt: null,
    confidence: 'TRUSTED_SOURCE',
    fieldProvenance: { title: 'TICKETMASTER', startsAt: 'TICKETMASTER' },
    minPriceCents: null,
    artistCount: 0,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

interface World {
  event?: Record<string, unknown> | null;
  listRows?: Record<string, unknown>[];
  slugTaken?: boolean;
  venueExists?: boolean;
  knownArtistIds?: string[];
  knownGenreIds?: string[];
  currentArtistIds?: string[];
  currentGenreIds?: string[];
  sources?: Record<string, unknown>[];
  ingested?: boolean;
  submitted?: boolean;
  detailVenue?: Record<string, unknown>;
}

/** Answers each query by the table it touches, so the tests don't depend on how many queries run in what order. */
function world(w: World): OpResolver {
  return (op) => {
    const table = tableOf(op);
    const keys = selectedKeys(op);

    if (op.root === 'insert' && table === events) return [{ id: NEW_ID }];
    if (op.root !== 'select') return undefined;

    if (table === events) {
      if (keys.includes('event')) {
        return w.event
          ? [{ event: w.event, venueId: null, venueName: null, venueSlug: null, venueCity: null, venueState: null, ...w.detailVenue }]
          : [];
      }
      if (keys.includes('artistCount')) return w.listRows ?? [];
      if (keys.length === 0) return w.event ? [w.event] : [];
      if (keys.includes('status')) return w.event ? [{ id: EVENT_ID, title: w.event.title, status: w.event.status }] : [];
      return w.slugTaken ? [{ id: 'taken' }] : [];
    }
    if (table === venues) return w.venueExists ? [{ id: VENUE_ID }] : [];
    if (table === artists) return (w.knownArtistIds ?? []).map((id) => ({ id }));
    if (table === genres) return (w.knownGenreIds ?? []).map((id) => ({ id }));
    if (table === eventArtists) return keys.includes('artistId') ? (w.currentArtistIds ?? []).map((artistId) => ({ artistId })) : [];
    if (table === eventGenres) return keys.includes('genreId') ? (w.currentGenreIds ?? []).map((genreId) => ({ genreId })) : [];
    if (table === eventSources) return w.sources ?? [];
    if (table === incomingEvents) return w.ingested ? [{ id: 'inc' }] : [];
    if (table === communitySubmissions) return w.submitted ? [{ id: 'sub' }] : [];
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

function valuesOf(op: RecordedOp | undefined): Record<string, unknown> {
  return stepArg(op!, 'values') as Record<string, unknown>;
}

function setOf(op: RecordedOp | undefined): Record<string, unknown> {
  return stepArg(op!, 'set') as Record<string, unknown>;
}

function auditValues(): Record<string, unknown> {
  return valuesOf(writes('insert', adminAuditLog)[0]);
}

function createInput(overrides: Partial<CreateAdminEventInput> = {}): CreateAdminEventInput {
  return {
    title: 'Knock2 Live',
    startsAt: new Date('2026-10-17T22:00:00Z'),
    artistIds: [],
    genreIds: [],
    status: 'PUBLISHED',
    ...overrides,
  };
}

describe('createAdminEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an admin-sourced, admin-verified event with provenance on the fields the admin set', async () => {
    useWorld({ event: eventRow({ id: NEW_ID }) });

    const result = await createAdminEvent(ADMIN, createInput());

    const values = valuesOf(writes('insert', events)[0]);
    expect(values).toMatchObject({
      title: 'Knock2 Live',
      slug: 'knock2-live-2026-10-17',
      startsAt: new Date('2026-10-17T22:00:00Z'),
      endsAt: null,
      venueId: null,
      status: 'PUBLISHED',
      primarySource: 'ADMIN',
      confidence: 'ADMIN_VERIFIED',
      fieldProvenance: { title: 'ADMIN', startsAt: 'ADMIN' },
    });
    expect(values.lastVerifiedAt).toBeInstanceOf(Date);
    expect(values).not.toHaveProperty('timezone');
    expect(result.id).toBe(NEW_ID);
  });

  it('stamps provenance for every optional field it was given, and honors an explicit time zone and DRAFT status', async () => {
    useWorld({ event: eventRow({ id: NEW_ID }), venueExists: true });

    await createAdminEvent(
      ADMIN,
      createInput({
        venueId: VENUE_ID,
        endsAt: new Date('2026-10-18T04:00:00Z'),
        description: 'All night.',
        imageUrl: 'https://example.com/poster.jpg',
        timezone: 'America/Chicago',
        ageRestriction: '21+',
        doorTime: '21:00',
        status: 'DRAFT',
      }),
    );

    const values = valuesOf(writes('insert', events)[0]);
    expect(values).toMatchObject({
      venueId: VENUE_ID,
      timezone: 'America/Chicago',
      ageRestriction: '21+',
      doorTime: '21:00',
      status: 'DRAFT',
      fieldProvenance: {
        title: 'ADMIN',
        startsAt: 'ADMIN',
        endsAt: 'ADMIN',
        description: 'ADMIN',
        imageUrl: 'ADMIN',
        venueId: 'ADMIN',
      },
    });
  });

  it('adds the lineup in billing order with the first artist as headliner, and sets the artist count', async () => {
    useWorld({ event: eventRow({ id: NEW_ID }), knownArtistIds: [A1, A2] });

    await createAdminEvent(ADMIN, createInput({ artistIds: [A2, A1] }));

    const lineup = writes('insert', eventArtists)[0]?.steps.find((s) => s.name === 'values')?.args[0];
    expect(lineup).toEqual([
      { eventId: NEW_ID, artistId: A2, isHeadliner: true, sortOrder: 0 },
      { eventId: NEW_ID, artistId: A1, isHeadliner: false, sortOrder: 1 },
    ]);
    const counts = writes('update', events).map((op) => setOf(op));
    expect(counts).toContainEqual({ artistCount: 2 });
  });

  it('links the genres', async () => {
    useWorld({ event: eventRow({ id: NEW_ID }), knownGenreIds: [G1, G2] });

    await createAdminEvent(ADMIN, createInput({ genreIds: [G1, G2] }));

    const links = writes('insert', eventGenres)[0]?.steps.find((s) => s.name === 'values')?.args[0];
    expect(links).toEqual([
      { eventId: NEW_ID, genreId: G1 },
      { eventId: NEW_ID, genreId: G2 },
    ]);
  });

  it('appends a suffix when the natural slug is already taken', async () => {
    useWorld({ event: eventRow({ id: NEW_ID }), slugTaken: true });

    await createAdminEvent(ADMIN, createInput());

    const slug = valuesOf(writes('insert', events)[0]).slug as string;
    expect(slug).not.toBe('knock2-live-2026-10-17');
    expect(slug.startsWith('knock2-live-2026-10-17-')).toBe(true);
  });

  it('writes an audit entry', async () => {
    useWorld({ event: eventRow({ id: NEW_ID }) });

    await createAdminEvent(ADMIN, createInput({ status: 'DRAFT' }));

    expect(auditValues()).toMatchObject({
      adminId: ADMIN,
      action: 'create_event',
      targetType: 'event',
      targetId: NEW_ID,
      details: { title: 'Knock2 Live', status: 'DRAFT' },
    });
  });

  it('rejects an unknown venue, artist or genre before inserting anything', async () => {
    useWorld({ venueExists: false });
    await expect(createAdminEvent(ADMIN, createInput({ venueId: VENUE_ID }))).rejects.toBeInstanceOf(ValidationError);

    useWorld({ knownArtistIds: [A1] });
    await expect(createAdminEvent(ADMIN, createInput({ artistIds: [A1, A2] }))).rejects.toMatchObject({
      message: 'Unknown artist IDs',
      details: { field: 'artistIds', missing: [A2] },
    });

    useWorld({ knownGenreIds: [] });
    await expect(createAdminEvent(ADMIN, createInput({ genreIds: [G1] }))).rejects.toMatchObject({
      details: { field: 'genreIds', missing: [G1] },
    });
    expect(writes('insert', events)).toHaveLength(0);
  });
});

describe('updateAdminEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function update(input: UpdateAdminEventInput): Promise<unknown> {
    return updateAdminEvent(ADMIN, EVENT_ID, input);
  }

  it('404s for an unknown event', async () => {
    useWorld({ event: null });

    await expect(update({ title: 'New' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does nothing, and logs nothing, when the request changes nothing', async () => {
    useWorld({ event: eventRow() });

    await update({ title: 'Knock2 at Brooklyn Mirage', startsAt: new Date('2026-10-17T22:00:00Z'), endsAt: null });

    expect(writes('update', events)).toHaveLength(0);
    expect(writes('insert', adminAuditLog)).toHaveLength(0);
  });

  it('applies changed fields, stamps them ADMIN in provenance, and records before/after in the audit log', async () => {
    useWorld({ event: eventRow() });

    await update({ title: 'Knock2 Live at the Mirage', description: 'Bass all night.' });

    const set = setOf(writes('update', events)[0]);
    expect(set).toMatchObject({
      title: 'Knock2 Live at the Mirage',
      description: 'Bass all night.',
      fieldProvenance: { title: 'ADMIN', startsAt: 'TICKETMASTER', description: 'ADMIN' },
    });
    expect(set.lastVerifiedAt).toBeInstanceOf(Date);
    expect(auditValues()).toMatchObject({
      action: 'update_event',
      targetId: EVENT_ID,
      details: {
        changes: {
          title: { from: 'Knock2 at Brooklyn Mirage', to: 'Knock2 Live at the Mirage' },
          description: { from: null, to: 'Bass all night.' },
        },
      },
    });
  });

  it('only sends the changed columns and leaves the slug alone when the title changes', async () => {
    useWorld({ event: eventRow() });

    await update({ title: 'Renamed', doorTime: '21:00' });

    const set = setOf(writes('update', events)[0]);
    expect(set).toHaveProperty('title');
    expect(set).toHaveProperty('doorTime', '21:00');
    expect(set).not.toHaveProperty('slug');
    expect(set).not.toHaveProperty('description');
  });

  it('protects only the tracked fields: an untracked field or a status change is not stamped in provenance', async () => {
    useWorld({ event: eventRow() });

    await update({ ageRestriction: '18+', status: 'CANCELLED' });

    const set = setOf(writes('update', events)[0]);
    expect(set).toMatchObject({ ageRestriction: '18+', status: 'CANCELLED' });
    expect(set.fieldProvenance).toEqual({ title: 'TICKETMASTER', startsAt: 'TICKETMASTER' });
  });

  it('clears a field when sent null', async () => {
    useWorld({ event: eventRow({ description: 'Old text', fieldProvenance: { description: 'TICKETMASTER' } }) });

    await update({ description: null });

    const set = setOf(writes('update', events)[0]);
    expect(set).toHaveProperty('description', null);
    expect(set.fieldProvenance).toMatchObject({ description: 'ADMIN' });
  });

  it('can detach the venue without checking it exists, but checks a new one does', async () => {
    useWorld({ event: eventRow({ venueId: VENUE_ID }) });
    await update({ venueId: null });
    expect(setOf(writes('update', events)[0])).toHaveProperty('venueId', null);

    useWorld({ event: eventRow(), venueExists: false });
    await expect(update({ venueId: VENUE_ID })).rejects.toBeInstanceOf(ValidationError);
    expect(writes('update', events)).toHaveLength(0);
  });

  it('rejects an end time at or before the resulting start time, using the stored value for whichever is not sent', async () => {
    useWorld({ event: eventRow({ endsAt: new Date('2026-10-18T04:00:00Z') }) });
    await expect(update({ startsAt: new Date('2026-10-18T05:00:00Z') })).rejects.toBeInstanceOf(ValidationError);

    useWorld({ event: eventRow() });
    await expect(update({ endsAt: new Date('2026-10-17T21:00:00Z') })).rejects.toBeInstanceOf(ValidationError);
    expect(writes('update', events)).toHaveLength(0);
  });

  it('replaces the lineup when its order or membership changes, and updates the count', async () => {
    useWorld({ event: eventRow(), knownArtistIds: [A1, A2], currentArtistIds: [A1] });

    await update({ artistIds: [A2, A1] });

    expect(writes('delete', eventArtists)).toHaveLength(1);
    const lineup = writes('insert', eventArtists)[0]?.steps.find((s) => s.name === 'values')?.args[0];
    expect(lineup).toEqual([
      { eventId: EVENT_ID, artistId: A2, isHeadliner: true, sortOrder: 0 },
      { eventId: EVENT_ID, artistId: A1, isHeadliner: false, sortOrder: 1 },
    ]);
    expect(writes('update', events).map((op) => setOf(op))).toContainEqual({ artistCount: 2 });
    expect(auditValues()).toMatchObject({ details: expect.objectContaining({ artistIds: [A2, A1] }) });
  });

  it('leaves the lineup alone when the same artists are sent in the same order', async () => {
    useWorld({ event: eventRow(), knownArtistIds: [A1, A2], currentArtistIds: [A1, A2] });

    await update({ artistIds: [A1, A2] });

    expect(writes('delete', eventArtists)).toHaveLength(0);
    expect(writes('insert', adminAuditLog)).toHaveLength(0);
  });

  it('clears the lineup for an empty list', async () => {
    useWorld({ event: eventRow(), currentArtistIds: [A1] });

    await update({ artistIds: [] });

    expect(writes('delete', eventArtists)).toHaveLength(1);
    expect(writes('insert', eventArtists)).toHaveLength(0);
    expect(writes('update', events).map((op) => setOf(op))).toContainEqual({ artistCount: 0 });
  });

  it('replaces genres only when the set differs, ignoring order', async () => {
    useWorld({ event: eventRow(), knownGenreIds: [G1, G2], currentGenreIds: [G1, G2] });
    await update({ genreIds: [G2, G1] });
    expect(writes('delete', eventGenres)).toHaveLength(0);

    useWorld({ event: eventRow(), knownGenreIds: [G1, G2], currentGenreIds: [G1] });
    await update({ genreIds: [G1, G2] });
    expect(writes('delete', eventGenres)).toHaveLength(1);
    expect(writes('insert', eventGenres)).toHaveLength(1);
  });

  it('rejects unknown artist ids without changing anything', async () => {
    useWorld({ event: eventRow(), knownArtistIds: [] });

    await expect(update({ artistIds: [A1] })).rejects.toMatchObject({ details: { missing: [A1] } });
    expect(writes('update', events)).toHaveLength(0);
  });
});

describe('deleteAdminEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('404s for an unknown event', async () => {
    useWorld({ event: null });

    await expect(deleteAdminEvent(ADMIN, EVENT_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cancels a published event instead of deleting it, without looking for references', async () => {
    useWorld({ event: eventRow({ status: 'PUBLISHED' }) });

    await deleteAdminEvent(ADMIN, EVENT_ID);

    expect(writes('delete', events)).toHaveLength(0);
    expect(setOf(writes('update', events)[0])).toMatchObject({ status: 'CANCELLED' });
    expect(ops.some((op) => tableOf(op) === incomingEvents)).toBe(false);
    expect(auditValues()).toMatchObject({
      action: 'delete_event',
      details: { previousStatus: 'PUBLISHED', mode: 'cancelled' },
    });
  });

  it('hard-deletes a draft that nothing points at', async () => {
    useWorld({ event: eventRow({ status: 'DRAFT' }) });

    await deleteAdminEvent(ADMIN, EVENT_ID);

    expect(writes('delete', events)).toHaveLength(1);
    expect(writes('update', events)).toHaveLength(0);
    expect(auditValues()).toMatchObject({ details: { previousStatus: 'DRAFT', mode: 'deleted' } });
  });

  it('cancels a draft instead when an ingestion record or submission still references it', async () => {
    useWorld({ event: eventRow({ status: 'DRAFT' }), ingested: true });
    await deleteAdminEvent(ADMIN, EVENT_ID);
    expect(writes('delete', events)).toHaveLength(0);
    expect(setOf(writes('update', events)[0])).toMatchObject({ status: 'CANCELLED' });
    expect(auditValues()).toMatchObject({ details: { mode: 'cancelled' } });

    useWorld({ event: eventRow({ status: 'DRAFT' }), submitted: true });
    await deleteAdminEvent(ADMIN, EVENT_ID);
    expect(writes('delete', events)).toHaveLength(0);
  });
});

describe('listAdminEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function listRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: EVENT_ID,
      title: 'Knock2 at Brooklyn Mirage',
      slug: 'knock2',
      startsAt: new Date('2026-10-17T22:00:00Z'),
      status: 'DRAFT',
      artistCount: 2,
      primarySource: 'ADMIN',
      confidence: 'ADMIN_VERIFIED',
      createdAt: new Date('2026-09-20T12:00:00Z'),
      updatedAt: new Date('2026-09-20T12:00:00Z'),
      venueId: null,
      venueName: null,
      venueCity: null,
      venueState: null,
      ...overrides,
    };
  }

  it('lists events of any status with their sources and no filter by default', async () => {
    useWorld({
      listRows: [listRow()],
      sources: [
        {
          eventId: EVENT_ID,
          sourceType: 'TICKETMASTER',
          externalId: 'tm-1',
          sourceUrl: 'https://tm.example/1',
          lastSyncedAt: new Date('2026-09-20T00:00:00Z'),
        },
      ],
    });

    const result = await listAdminEvents({});

    expect(result.data[0]).toMatchObject({
      id: EVENT_ID,
      status: 'DRAFT',
      venue: null,
      artistCount: 2,
      sources: [{ sourceType: 'TICKETMASTER', externalId: 'tm-1', sourceUrl: 'https://tm.example/1' }],
    });
    expect(result.cursor).toBeNull();
    const where = ops[0]?.steps.find((s) => s.name === 'where')?.args[0];
    expect(where).toBeUndefined();
  });

  it('includes the venue when there is one', async () => {
    useWorld({ listRows: [listRow({ venueId: VENUE_ID, venueName: 'Brooklyn Mirage', venueCity: 'Brooklyn', venueState: 'NY' })] });

    const result = await listAdminEvents({});

    expect(result.data[0]?.venue).toEqual({ id: VENUE_ID, name: 'Brooklyn Mirage', city: 'Brooklyn', state: 'NY' });
  });

  it('searches titles case-insensitively and escapes LIKE wildcards in the search text', async () => {
    useWorld({ listRows: [] });

    await listAdminEvents({ q: '50%_off' });

    const where = whereOf(ops[0], dialect);
    expect(where.sql).toContain('"events"."title" ilike');
    expect(where.params).toEqual(['%50\\%\\_off%']);
  });

  it('filters by status', async () => {
    useWorld({ listRows: [] });

    await listAdminEvents({ status: 'DRAFT' });

    expect(whereOf(ops[0], dialect).params).toEqual(['DRAFT']);
  });

  it('pages newest-created first with a (createdAt, id) cursor', async () => {
    useWorld({ listRows: [listRow(), listRow({ id: '99999999-9999-4999-8999-999999999999' })] });

    const result = await listAdminEvents({ limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(decodeCursor(result.cursor!)).toEqual({ createdAt: '2026-09-20T12:00:00.000Z', id: EVENT_ID });
  });

  it('resumes strictly before the cursor and rejects a malformed one', async () => {
    useWorld({ listRows: [] });
    await listAdminEvents({ cursor: encodeCursor({ createdAt: '2026-09-20T12:00:00.000Z', id: EVENT_ID }) });
    expect(whereOf(ops[0], dialect).sql).toContain('("events"."created_at", "events"."id") < (');

    await expect(listAdminEvents({ cursor: 'bogus' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('getAdminEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('404s for an unknown event', async () => {
    useWorld({ event: null });

    await expect(getAdminEvent(EVENT_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the full curated detail, including provenance and sources', async () => {
    useWorld({
      event: eventRow({ doorTime: '21:00:00', ageRestriction: '21+', venueId: VENUE_ID }),
      detailVenue: { venueId: VENUE_ID, venueName: 'Brooklyn Mirage', venueSlug: 'brooklyn-mirage', venueCity: 'Brooklyn', venueState: 'NY' },
      sources: [
        { eventId: EVENT_ID, sourceType: 'COMMUNITY', externalId: 'sub-1', sourceUrl: null, lastSyncedAt: new Date('2026-09-20T00:00:00Z') },
      ],
    });

    const result = await getAdminEvent(EVENT_ID);

    expect(result).toMatchObject({
      id: EVENT_ID,
      status: 'PUBLISHED',
      doorTime: '21:00:00',
      ageRestriction: '21+',
      primarySource: 'TICKETMASTER',
      confidence: 'TRUSTED_SOURCE',
      fieldProvenance: { title: 'TICKETMASTER', startsAt: 'TICKETMASTER' },
      venue: { id: VENUE_ID, name: 'Brooklyn Mirage', slug: 'brooklyn-mirage', city: 'Brooklyn', state: 'NY' },
      artists: [],
      genres: [],
      sources: [{ sourceType: 'COMMUNITY', externalId: 'sub-1' }],
    });
    expect(result).not.toHaveProperty('searchVector');
  });
});
