import { rateLimitedFetch } from './musicbrainz.client';
import type { MusicBrainzArtistResult, MusicBrainzBrowseResponse } from './musicbrainz.types';

function normalizeArtist(raw: {
  id: string;
  name: string;
  disambiguation?: string;
  type?: string;
  country?: string;
}): MusicBrainzArtistResult {
  return {
    mbid: raw.id,
    name: raw.name,
    disambiguation: raw.disambiguation ?? null,
    type: raw.type ?? null,
    country: raw.country ?? null,
  };
}

/**
 * Look up an artist by Spotify ID via MusicBrainz's URL relationship lookup.
 * MB stores Spotify URLs as URL relations on artist entities.
 */
export async function lookupBySpotifyId(spotifyId: string): Promise<MusicBrainzArtistResult | null> {
  try {
    // MusicBrainz allows browsing artists by URL resource
    const encoded = encodeURIComponent(`https://open.spotify.com/artist/${spotifyId}`);
    const data = await rateLimitedFetch<MusicBrainzBrowseResponse>(
      `/artist?url=${encoded}&limit=1`,
    );

    if (!data.artists || data.artists.length === 0) return null;
    return normalizeArtist(data.artists[0]!);
  } catch {
    return null;
  }
}
