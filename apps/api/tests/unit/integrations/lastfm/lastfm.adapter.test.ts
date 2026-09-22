import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LastfmArtistInfoResponse } from '../../../../src/integrations/lastfm/lastfm.types';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    lastfm: {
      apiKey: 'test-api-key' as string | undefined,
    },
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
    json: async () => body,
  } as unknown as Response;
}

function makeArtistInfo(
  overrides: Partial<LastfmArtistInfoResponse['artist']> = {},
): LastfmArtistInfoResponse {
  return {
    artist: {
      name: 'Fred Again',
      mbid: 'mbid-123',
      bio: { summary: '<a href="#">Fred again..</a> is a UK producer. Read more on Last.fm.' },
      tags: { tag: [{ name: 'uk garage' }, { name: 'electronic' }] },
      similar: { artist: [{ name: 'Skrillex' }, { name: 'Four Tet' }] },
      stats: { listeners: '1000000', playcount: '50000000' },
      ...overrides,
    },
  };
}

async function loadAdapter() {
  return import('../../../../src/integrations/lastfm/lastfm.adapter');
}

describe('lastfm adapter', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    mockConfig.lastfm.apiKey = 'test-api-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws NotImplementedError when Last.fm is not configured', async () => {
    mockConfig.lastfm.apiKey = undefined;
    const { getArtistInfo } = await loadAdapter();

    await expect(getArtistInfo('Fred Again')).rejects.toThrow('Last.fm is not configured');
  });

  it('parses and normalizes artist info, stripping HTML and the "Read more" suffix', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(makeArtistInfo()));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtistInfo } = await loadAdapter();
    const result = await getArtistInfo('Fred Again');

    expect(result).toEqual({
      name: 'Fred Again',
      mbid: 'mbid-123',
      bio: 'Fred again.. is a UK producer.',
      tags: ['uk garage', 'electronic'],
      similarArtists: ['Skrillex', 'Four Tet'],
      listeners: 1000000,
      playcount: 50000000,
    });
  });

  it('handles a single tag returned as an object instead of an array', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(makeArtistInfo({ tags: { tag: { name: 'techno' } } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getArtistInfo } = await loadAdapter();
    const result = await getArtistInfo('Fred Again');

    expect(result?.tags).toEqual(['techno']);
  });

  it('handles a single similar artist returned as an object instead of an array', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(makeArtistInfo({ similar: { artist: { name: 'Bicep' } } })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getArtistInfo } = await loadAdapter();
    const result = await getArtistInfo('Fred Again');

    expect(result?.similarArtists).toEqual(['Bicep']);
  });

  it('returns null bio when no bio summary is present', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(makeArtistInfo({ bio: undefined })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getArtistInfo } = await loadAdapter();
    const result = await getArtistInfo('Fred Again');

    expect(result?.bio).toBeNull();
  });

  it('returns null when the Last.fm API request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({}, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtistInfo } = await loadAdapter();
    const result = await getArtistInfo('Unknown Artist');

    expect(result).toBeNull();
  });

  it('returns null when the response has no artist field', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({} as unknown as LastfmArtistInfoResponse));
    vi.stubGlobal('fetch', fetchMock);

    const { getArtistInfo } = await loadAdapter();
    const result = await getArtistInfo('Fred Again');

    expect(result).toBeNull();
  });
});
