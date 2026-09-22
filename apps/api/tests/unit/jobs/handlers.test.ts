import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('../../../src/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));
vi.mock('../../../src/modules/admin/sync.service', () => ({ syncTicketmaster: vi.fn() }));
vi.mock('../../../src/modules/artists/ingestion.service', () => ({ ingestBySpotifyId: vi.fn() }));
vi.mock('../../../src/modules/notifications/notification-triggers', () => ({
  scanEventTomorrow: vi.fn(),
  scanEventCancelled: vi.fn(),
  scanEventRescheduled: vi.fn(),
  scanArtistNewEvent: vi.fn(),
  scanSubmissionUpdates: vi.fn(),
}));

import { db } from '../../../src/db/client';
import { artists } from '../../../src/db/schema/artists';
import { events } from '../../../src/db/schema/events';
import * as syncService from '../../../src/modules/admin/sync.service';
import * as ingestionService from '../../../src/modules/artists/ingestion.service';
import * as triggers from '../../../src/modules/notifications/notification-triggers';
import { handleArtistRefresh } from '../../../src/jobs/handlers/artist-refresh';
import { handleEventSyncTicketmaster } from '../../../src/jobs/handlers/event-sync-ticketmaster';
import { handleNotificationDispatch } from '../../../src/jobs/handlers/notification-dispatch';
import { handleStaleDetection } from '../../../src/jobs/handlers/stale-detection';
import { installFakeDb, stepArg, tableOf, whereOf, type RecordedOp } from '../../helpers/fake-db';

const dialect = new PgDialect();
const MESSAGE = { jobType: 'test', scheduledAt: '2026-09-21T00:00:00Z' };

describe('handleEventSyncTicketmaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls syncTicketmaster and does not swallow its result', async () => {
    vi.mocked(syncService.syncTicketmaster).mockResolvedValue({
      eventsStaged: 5,
      eventsProcessed: 5,
      eventsFailed: 0,
      eventsSkipped: 0,
    });

    await handleEventSyncTicketmaster(MESSAGE);

    expect(syncService.syncTicketmaster).toHaveBeenCalledTimes(1);
  });

  it('propagates a thrown error rather than swallowing it, so SQS retries', async () => {
    vi.mocked(syncService.syncTicketmaster).mockRejectedValue(new Error('Ticketmaster is down'));

    await expect(handleEventSyncTicketmaster(MESSAGE)).rejects.toThrow('Ticketmaster is down');
  });
});

describe('handleArtistRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caps the batch at 50 and refreshes each candidate', async () => {
    const { ops } = installFakeDb(db as never, [
      [
        { id: 'artist-1', spotifyId: 'sp-1' },
        { id: 'artist-2', spotifyId: 'sp-2' },
      ],
    ]);
    vi.mocked(ingestionService.ingestBySpotifyId).mockResolvedValue({
      artistId: 'artist-1',
      name: 'Test',
      slug: 'test',
      isNew: false,
      sources: ['SPOTIFY'],
      genresLinked: 0,
    });

    await handleArtistRefresh(MESSAGE);

    const selectOp = ops.find((op: RecordedOp) => op.root === 'select' && tableOf(op) === artists);
    expect(stepArg(selectOp!, 'limit')).toBe(50);
    expect(ingestionService.ingestBySpotifyId).toHaveBeenCalledTimes(2);
    expect(ingestionService.ingestBySpotifyId).toHaveBeenCalledWith('sp-1');
    expect(ingestionService.ingestBySpotifyId).toHaveBeenCalledWith('sp-2');
  });

  it("does not let one artist's failure stop the others or throw out of the handler", async () => {
    installFakeDb(db as never, [
      [
        { id: 'artist-1', spotifyId: 'sp-1' },
        { id: 'artist-2', spotifyId: 'sp-2' },
      ],
    ]);
    vi.mocked(ingestionService.ingestBySpotifyId).mockRejectedValueOnce(new Error('Spotify 500'));
    vi.mocked(ingestionService.ingestBySpotifyId).mockResolvedValueOnce({
      artistId: 'artist-2',
      name: 'Test 2',
      slug: 'test-2',
      isNew: false,
      sources: ['SPOTIFY'],
      genresLinked: 0,
    });

    await expect(handleArtistRefresh(MESSAGE)).resolves.toBeUndefined();

    expect(ingestionService.ingestBySpotifyId).toHaveBeenCalledTimes(2);
  });
});

describe('handleStaleDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flags newly stale events and un-flags refreshed ones', async () => {
    const { ops } = installFakeDb(db as never, [[{ id: 'ev-1' }], [{ id: 'ev-2' }]]);

    await handleStaleDetection(MESSAGE);

    const updateOps = ops.filter(
      (op: RecordedOp) => op.root === 'update' && tableOf(op) === events,
    );
    expect(updateOps).toHaveLength(2);

    const flagWhere = whereOf(updateOps[0], dialect);
    expect(flagWhere.sql).toContain('"events"."status" = $1');
    expect(flagWhere.sql).toContain('"events"."stale_flagged_at" is null');
    expect(flagWhere.params).toContain('PUBLISHED');

    const unflagWhere = whereOf(updateOps[1], dialect);
    expect(unflagWhere.sql).toContain('"events"."stale_flagged_at" is not null');
    expect(unflagWhere.sql).toContain('"events"."last_verified_at" is not null');
  });
});

describe('handleNotificationDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs all five trigger scans and does not throw', async () => {
    vi.mocked(triggers.scanEventTomorrow).mockResolvedValue(1);
    vi.mocked(triggers.scanEventCancelled).mockResolvedValue(2);
    vi.mocked(triggers.scanEventRescheduled).mockResolvedValue(0);
    vi.mocked(triggers.scanArtistNewEvent).mockResolvedValue(3);
    vi.mocked(triggers.scanSubmissionUpdates).mockResolvedValue(4);

    await handleNotificationDispatch(MESSAGE);

    expect(triggers.scanEventTomorrow).toHaveBeenCalledTimes(1);
    expect(triggers.scanEventCancelled).toHaveBeenCalledTimes(1);
    expect(triggers.scanEventRescheduled).toHaveBeenCalledTimes(1);
    expect(triggers.scanArtistNewEvent).toHaveBeenCalledTimes(1);
    expect(triggers.scanSubmissionUpdates).toHaveBeenCalledTimes(1);
  });
});
