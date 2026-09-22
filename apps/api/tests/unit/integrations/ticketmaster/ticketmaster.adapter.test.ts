import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketmasterEventRaw, TicketmasterSearchResponse } from '../../../../src/integrations/ticketmaster/ticketmaster.types';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    ticketmaster: { apiKey: 'test-tm-key' as string | undefined },
  },
}));

vi.mock('../../../../src/config/index', () => ({
  config: mockConfig,
}));

function jsonResponse(body: unknown, opts: { status?: number } = {}): Response {
  const status = opts.status ?? 200;
  return {
    ok: status < 400,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

function makeRawEvent(overrides: Partial<TicketmasterEventRaw> = {}): TicketmasterEventRaw {
  return {
    id: 'tm-1',
    name: 'Skrillex at Brooklyn Mirage',
    dates: { start: { dateTime: '2024-08-15T22:00:00Z' } },
    ...overrides,
  };
}

function pageResponse(
  events: TicketmasterEventRaw[],
  page: { size: number; totalElements: number; totalPages: number; number: number },
): TicketmasterSearchResponse {
  return { _embedded: events.length > 0 ? { events } : undefined, page };
}

async function loadAdapter() {
  return import('../../../../src/integrations/ticketmaster/ticketmaster.adapter');
}

const PARAMS = { stateCode: 'NY', startDateTime: '2024-08-01T00:00:00Z', endDateTime: '2024-08-31T00:00:00Z' };

describe('ticketmaster adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    mockConfig.ticketmaster.apiKey = 'test-tm-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('searchEvents', () => {
    it('throws NotImplementedError when Ticketmaster is not configured', async () => {
      mockConfig.ticketmaster.apiKey = undefined;
      const { searchEvents } = await loadAdapter();

      await expect(searchEvents(PARAMS)).rejects.toThrow('Ticketmaster is not configured');
    });

    it('parses a fixture response', async () => {
      const raw = makeRawEvent();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(pageResponse([raw], { size: 200, totalElements: 1, totalPages: 1, number: 0 })));
      vi.stubGlobal('fetch', fetchMock);

      const { searchEvents } = await loadAdapter();
      const result = await searchEvents(PARAMS);

      expect(result).toEqual({ events: [raw], totalPages: 1, totalElements: 1 });
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('classificationName=Music');
      expect(url).not.toContain('classificationId');
    });

    it('handles a response with no _embedded key (0 results) without throwing', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(pageResponse([], { size: 200, totalElements: 0, totalPages: 0, number: 0 })));
      vi.stubGlobal('fetch', fetchMock);

      const { searchEvents } = await loadAdapter();
      const result = await searchEvents(PARAMS);

      expect(result).toEqual({ events: [], totalPages: 0, totalElements: 0 });
    });
  });

  describe('fetchAllEvents', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('pages until a short page is returned', async () => {
      vi.useFakeTimers();
      const page0 = Array.from({ length: 200 }, (_, i) => makeRawEvent({ id: `tm-${i}` }));
      const page1 = [makeRawEvent({ id: 'tm-last' })];
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(pageResponse(page0, { size: 200, totalElements: 201, totalPages: 2, number: 0 })))
        .mockResolvedValueOnce(jsonResponse(pageResponse(page1, { size: 200, totalElements: 201, totalPages: 2, number: 1 })));
      vi.stubGlobal('fetch', fetchMock);

      const { fetchAllEvents } = await loadAdapter();
      const eventsPromise = fetchAllEvents(PARAMS);
      await vi.advanceTimersByTimeAsync(5000);
      const events = await eventsPromise;

      expect(events).toHaveLength(201);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('stops at the 1000-result ceiling even if more pages remain', async () => {
      vi.useFakeTimers();
      const fullPage = () => Array.from({ length: 200 }, (_, i) => makeRawEvent({ id: `tm-${i}` }));
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          jsonResponse(pageResponse(fullPage(), { size: 200, totalElements: 2000, totalPages: 10, number: 0 })),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { fetchAllEvents } = await loadAdapter();
      const eventsPromise = fetchAllEvents(PARAMS);
      await vi.advanceTimersByTimeAsync(5000);
      const events = await eventsPromise;

      expect(events).toHaveLength(1000);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it('handles a fully empty result set', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(pageResponse([], { size: 200, totalElements: 0, totalPages: 0, number: 0 })));
      vi.stubGlobal('fetch', fetchMock);

      const { fetchAllEvents } = await loadAdapter();
      const events = await fetchAllEvents(PARAMS);

      expect(events).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
