import { NotImplementedError } from '../../utils/errors';
import { isConfigured, spotifyFetch } from './spotify.client';
import type { SpotifyArtistRaw, SpotifySearchResponse } from './spotify.types';
import type { SpotifyArtistResult } from './spotify.types';

function normalizeArtist(raw: SpotifyArtistRaw): SpotifyArtistResult {
  const bestImage = raw.images.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  return {
    spotifyId: raw.id,
    name: raw.name,
    imageUrl: bestImage?.url ?? null,
    spotifyUrl: raw.external_urls.spotify,
    genres: raw.genres,
    popularity: raw.popularity,
    followerCount: raw.followers.total,
  };
}

export async function searchArtists(query: string, limit = 10): Promise<SpotifyArtistResult[]> {
  if (!isConfigured()) throw new NotImplementedError('Spotify is not configured');
  const encoded = encodeURIComponent(query);
  const data = await spotifyFetch<SpotifySearchResponse>(
    `/search?q=${encoded}&type=artist&limit=${limit}`,
  );
  return data.artists.items.map(normalizeArtist);
}

export async function getArtist(spotifyId: string): Promise<SpotifyArtistResult> {
  if (!isConfigured()) throw new NotImplementedError('Spotify is not configured');
  const raw = await spotifyFetch<SpotifyArtistRaw>(`/artists/${spotifyId}`);
  return normalizeArtist(raw);
}
