import { config } from '../../config/index';
import { logger } from '../../utils/logger';

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/';

function isConfigured(): boolean {
  return !!config.lastfm.apiKey;
}

async function lastfmFetch<T>(params: Record<string, string>): Promise<T> {
  if (!isConfigured()) {
    throw new Error('Last.fm API key not configured');
  }

  const searchParams = new URLSearchParams({
    ...params,
    api_key: config.lastfm.apiKey!,
    format: 'json',
  });

  const res = await fetch(`${LASTFM_API_BASE}?${searchParams.toString()}`);

  if (!res.ok) {
    logger.warn({ status: res.status, params }, 'Last.fm API error');
    throw new Error(`Last.fm API error: ${res.status}`);
  }

  return (await res.json()) as T;
}

export { isConfigured, lastfmFetch };
