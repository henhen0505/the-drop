import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotifyArtistRaw, SpotifySearchResponse, SpotifyTokenResponse } from '../../../../src/integrations/spotify/spotify.types';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    spotify: {
      clientId: 'test-client-id' as string | undefined,
      clientSecret: 'test-client-secret' as string | undefined,
    },
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

const tokenBody: SpotifyTokenResponse = {
  access_token: 'test-token',
  token_type: 'Bearer',
  expires_in: 3600,
};

function makeRawArtist(overrides: Partial<SpotifyArtistRaw> = {}): SpotifyArtistRaw {
  return {
    id: 'artist-1',
    name: 'Fred Again',
    images: [{ url: 'https://img/small.jpg', width: 64, height: 64 }],
    external_urls: { spotify: 'https://open.spotify.com/artist/artist-1' },
    genres: ['uk garage'],
    popularity: 80,
    followers: { total: 500000 },
    ...overrides,
  };
}

async function loadAdapter() {
  return import('../../../../src/integrations/spotify/spotify.adapter');
}

describe('spotify adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    mockConfig.spotify.clientId = 'test-client-id';
    mockConfig.spotify.clientSecret = 'test-client-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws NotImplementedError when Spotify is not configured', async () => {
    mockConfig.spotify.clientId = undefined;
    mockConfig.spotify.clientSecret = undefined;

    const { searchArtists, getArtist } = await loadAdapter();

    await expect(searchArtists('daft punk')).rejects.toThrow('Spotify is not configured');
    await expect(getArtist('artist-1')).rejects.toThrow('Spotify is not configured');
  });

  it('searchArtists parses and normalizes the search response', async () => {
    const searchBody: SpotifySearchResponse = {
      artists: {
        items: [makeRawArtist()],
        total: 1,
        limit: 10,
        offset: 0,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse(searchBody));
    vi.stubGlobal('fetch', fetchMock);

    const { searchArtists } = await loadAdapter();
    const results = await searchArtists('fred again');

    expect(results).toEqual([
      {
        spotifyId: 'artist-1',
        name: 'Fred Again',
        imageUrl: 'https://img/small.jpg',
        spotifyUrl: 'https://open.spotify.com/artist/artist-1',
        genres: ['uk garage'],
        popularity: 80,
        followerCount: 500000,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('getArtist returns a single normalized artist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse(makeRawArtist({ id: 'artist-2', name: 'Skrillex' })));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtist } = await loadAdapter();
    const result = await getArtist('artist-2');

    expect(result.spotifyId).toBe('artist-2');
    expect(result.name).toBe('Skrillex');
  });

  it('picks the widest image when multiple images are present', async () => {
    const raw = makeRawArtist({
      images: [
        { url: 'https://img/small.jpg', width: 64, height: 64 },
        { url: 'https://img/large.jpg', width: 640, height: 640 },
        { url: 'https://img/medium.jpg', width: 300, height: 300 },
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse(raw));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtist } = await loadAdapter();
    const result = await getArtist('artist-1');

    expect(result.imageUrl).toBe('https://img/large.jpg');
  });

  it('returns null imageUrl when there are no images', async () => {
    const raw = makeRawArtist({ images: [] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse(raw));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtist } = await loadAdapter();
    const result = await getArtist('artist-1');

    expect(result.imageUrl).toBeNull();
  });

  it('returns an empty genres array when Spotify reports none', async () => {
    const raw = makeRawArtist({ genres: [] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse(raw));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtist } = await loadAdapter();
    const result = await getArtist('artist-1');

    expect(result.genres).toEqual([]);
  });

  it('retries after a 429 rate limit response and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(jsonResponse(makeRawArtist()));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtist } = await loadAdapter();
    const result = await getArtist('artist-1');

    expect(result.spotifyId).toBe('artist-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('caches the access token across multiple calls', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse(makeRawArtist({ id: 'artist-1' })))
      .mockResolvedValueOnce(jsonResponse(makeRawArtist({ id: 'artist-2' })));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtist } = await loadAdapter();
    await getArtist('artist-1');
    await getArtist('artist-2');

    // 1 token request + 2 artist requests, not 2 token requests
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://accounts.spotify.com/api/token');
  });

  it('throws when the Spotify API responds with a non-ok, non-429 status', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tokenBody))
      .mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtist } = await loadAdapter();

    await expect(getArtist('artist-1')).rejects.toThrow('Spotify API error: 500');
  });
});
