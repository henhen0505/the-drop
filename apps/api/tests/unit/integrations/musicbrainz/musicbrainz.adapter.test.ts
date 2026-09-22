import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MusicBrainzBrowseResponse } from '../../../../src/integrations/musicbrainz/musicbrainz.types';

function jsonResponse(body: unknown, opts: { status?: number } = {}): Response {
  const status = opts.status ?? 200;
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as unknown as Response;
}

const foundResponse: MusicBrainzBrowseResponse = {
  artists: [
    {
      id: 'mbid-1',
      name: 'Fred Again',
      disambiguation: 'UK producer',
      type: 'Person',
      country: 'GB',
    },
  ],
};

const emptyResponse: MusicBrainzBrowseResponse = { artists: [] };

async function loadAdapter() {
  return import('../../../../src/integrations/musicbrainz/musicbrainz.adapter');
}

describe('musicbrainz adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns a normalized artist when a match is found', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(foundResponse));
    vi.stubGlobal('fetch', fetchMock);

    const { lookupBySpotifyId } = await loadAdapter();
    const result = await lookupBySpotifyId('spotify-id-1');

    expect(result).toEqual({
      mbid: 'mbid-1',
      name: 'Fred Again',
      disambiguation: 'UK producer',
      type: 'Person',
      country: 'GB',
    });
  });

  it('sends a User-Agent header and the fmt=json query param', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(foundResponse));
    vi.stubGlobal('fetch', fetchMock);

    const { lookupBySpotifyId } = await loadAdapter();
    await lookupBySpotifyId('spotify-id-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('fmt=json');
    expect((init.headers as Record<string, string>)['User-Agent']).toBeDefined();
  });

  it('returns null when no artist matches', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(emptyResponse));
    vi.stubGlobal('fetch', fetchMock);

    const { lookupBySpotifyId } = await loadAdapter();
    const result = await lookupBySpotifyId('spotify-id-unknown');

    expect(result).toBeNull();
  });

  it('returns null when the request fails', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    const { lookupBySpotifyId } = await loadAdapter();
    const result = await lookupBySpotifyId('spotify-id-1');

    expect(result).toBeNull();
  });

  it('waits at least MIN_REQUEST_INTERVAL_MS before firing a second request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(emptyResponse));
    vi.stubGlobal('fetch', fetchMock);

    const { lookupBySpotifyId } = await loadAdapter();

    await lookupBySpotifyId('spotify-id-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const secondCall = lookupBySpotifyId('spotify-id-2');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1100);
    await secondCall;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('backs off and retries on a 503 response', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(foundResponse));
    vi.stubGlobal('fetch', fetchMock);

    const { lookupBySpotifyId } = await loadAdapter();
    const resultPromise = lookupBySpotifyId('spotify-id-1');

    await vi.advanceTimersByTimeAsync(3000);
    const result = await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.mbid).toBe('mbid-1');
  });
});
