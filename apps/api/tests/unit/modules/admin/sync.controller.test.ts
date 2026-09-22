import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../../../src/integrations/ticketmaster', () => ({ isTicketmasterConfigured: vi.fn() }));
vi.mock('../../../../src/modules/admin/sync.service', () => ({
  syncTicketmaster: vi.fn(),
  getSyncStatus: vi.fn(),
}));

import { isTicketmasterConfigured } from '../../../../src/integrations/ticketmaster';
import * as syncService from '../../../../src/modules/admin/sync.service';
import * as syncController from '../../../../src/modules/admin/sync.controller';

function mockRes(): Response {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response;
}

// asyncHandler doesn't return the inner promise, so a rejection (e.g. ValidationError) only
// reaches next() on the following microtask -- flush one tick before asserting on it.
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('triggerSync', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 202 immediately without waiting for the sync to finish', async () => {
    vi.mocked(isTicketmasterConfigured).mockReturnValue(true);
    let syncResolved = false;
    vi.mocked(syncService.syncTicketmaster).mockImplementation(
      () => new Promise((resolve) => setImmediate(() => { syncResolved = true; resolve({ eventsStaged: 0, eventsProcessed: 0, eventsFailed: 0, eventsSkipped: 0 }); })),
    );
    const res = mockRes();
    const next = vi.fn();

    syncController.triggerSync({} as Request, res, next as NextFunction);

    expect(syncService.syncTicketmaster).toHaveBeenCalledOnce();
    expect(syncResolved).toBe(false);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ data: { message: 'Sync job triggered.' } });
    expect(next).not.toHaveBeenCalled();

    await flush();
  });

  it('returns 400 when Ticketmaster is not configured, without starting a sync', async () => {
    vi.mocked(isTicketmasterConfigured).mockReturnValue(false);
    const res = mockRes();
    const next = vi.fn();

    syncController.triggerSync({} as Request, res, next as NextFunction);
    await flush();

    expect(syncService.syncTicketmaster).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});

describe('getSyncStatus', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns whatever getSyncStatus() resolves to', async () => {
    const rows = [{ sourceType: 'TICKETMASTER', eventsSynced: 5 }];
    vi.mocked(syncService.getSyncStatus).mockResolvedValue(rows as never);
    const res = mockRes();
    const next = vi.fn();

    syncController.getSyncStatus({} as Request, res, next as NextFunction);
    await flush();

    expect(res.json).toHaveBeenCalledWith({ data: rows });
    expect(next).not.toHaveBeenCalled();
  });
});
