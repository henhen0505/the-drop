import { config } from '../../config/index';
import { logger } from '../../utils/logger';
import type { SpotifyTokenResponse, SpotifyArtistRaw, SpotifySearchResponse } from './spotify.types';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function isConfigured(): boolean {
  return !!(config.spotify.clientId && config.spotify.clientSecret);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${config.spotify.clientId}:${config.spotify.clientSecret}`,
  ).toString('base64');

  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }

  const data = (await res.json()) as SpotifyTokenResponse;
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function spotifyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '5');
    logger.warn({ retryAfter }, 'Spotify rate limited');
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return spotifyFetch<T>(path);
  }

  if (!res.ok) {
    throw new Error(`Spotify API error: ${res.status} on ${path}`);
  }

  return (await res.json()) as T;
}

export { isConfigured, spotifyFetch };
export type { SpotifyArtistRaw, SpotifySearchResponse };
