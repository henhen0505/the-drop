import { logger } from '../../utils/logger';

const MB_API_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'TheDrop/1.0.0 (https://github.com/thedrop)';
const MIN_REQUEST_INTERVAL_MS = 1100; // slightly over 1 sec to be safe

let lastRequestTime = 0;

async function rateLimitedFetch<T>(path: string): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();

  const url = `${MB_API_BASE}${path}${path.includes('?') ? '&' : '?'}fmt=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (res.status === 503) {
    logger.warn('MusicBrainz rate limited (503), backing off');
    await new Promise((r) => setTimeout(r, 3000));
    return rateLimitedFetch<T>(path);
  }

  if (!res.ok) {
    throw new Error(`MusicBrainz API error: ${res.status} on ${path}`);
  }

  return (await res.json()) as T;
}

export { rateLimitedFetch };
