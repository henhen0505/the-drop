import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    ticketmaster: { apiKey: 'test-tm-key' as string | undefined },
  },
}));

vi.mock('../../../../src/config/index', () => ({
  config: mockConfig,
}));

function jsonResponse(
  body: unknown,
  opts: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = opts.status ?? 200;
  return {
    ok: status < 400,
    status,
    headers: { get: (key: string) => opts.headers?.[key] ?? null },
    json: async () => body,
  } as unknown as Response;
}

async function loadClient() {
  return import('../../../../src/integrations/ticketmaster/ticketmaster.client');
}

describe('ticketmaster client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    mockConfig.ticketmaster.apiKey = 'test-tm-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('isConfigured is false when the API key is absent', async () => {
    mockConfig.ticketmaster.apiKey = undefined;
    const { isConfigured } = await loadClient();
    expect(isConfigured()).toBe(false);
  });

  it('isConfigured is true when the API key is present', async () => {
    const { isConfigured } = await loadClient();
    expect(isConfigured()).toBe(true);
  });

  it('includes the apikey query param', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ page: { size: 1, totalElements: 0, totalPages: 0, number: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    const { tmFetch } = await loadClient();
    await tmFetch('events.json', { stateCode: 'NY' });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('apikey=test-tm-key');
    expect(url).toContain('stateCode=NY');
  });

  it('waits at least 500ms before firing a second request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ page: { size: 1, totalElements: 0, totalPages: 0, number: 0 } }));
    vi.stubGlobal('fetch', fetchMock);

    const { tmFetch } = await loadClient();

    await tmFetch('events.json', { stateCode: 'NY' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondCall = tmFetch('events.json', { stateCode: 'CA' });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    await secondCall;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries after a 429 using Retry-After, and eventually succeeds', async () => {
    vi.useFakeTimers();
    const body = { page: { size: 1, totalElements: 0, totalPages: 0, number: 0 } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    const { tmFetch } = await loadClient();
    const resultPromise = tmFetch('events.json', { stateCode: 'NY' });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to a fixed delay on 429 when Retry-After is absent', async () => {
    vi.useFakeTimers();
    const body = { page: { size: 1, totalElements: 0, totalPages: 0, number: 0 } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(body));
    vi.stubGlobal('fetch', fetchMock);

    const { tmFetch } = await loadClient();
    const resultPromise = tmFetch('events.json', { stateCode: 'NY' });

    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on a non-ok, non-429 status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const { tmFetch } = await loadClient();

    await expect(tmFetch('events.json', { stateCode: 'NY' })).rejects.toThrow(
      'Ticketmaster API error: 500',
    );
  });
});
