import { config } from '../../config/index';
import { logger } from '../../utils/logger';

const TM_API_BASE = 'https://app.ticketmaster.com/discovery/v2/';
const MIN_REQUEST_INTERVAL_MS = 500; // Ticketmaster's documented ceiling is ~5 req/sec; 2 req/sec is the conservative target.
const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_429_RETRIES = 5;

let lastRequestTime = 0;

function isConfigured(): boolean {
  return !!config.ticketmaster.apiKey;
}

async function tmFetch<T>(path: string, params: Record<string, string>, retryCount = 0): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();

  const query = new URLSearchParams({ ...params, apikey: config.ticketmaster.apiKey ?? '' });
  const url = `${TM_API_BASE}${path}?${query.toString()}`;
  const res = await fetch(url);

  if (res.status === 429) {
    // Capped so a sustained outage fails loudly instead of recursing forever and
    // silently hanging the fire-and-forget sync (see sync.controller.ts).
    if (retryCount >= MAX_429_RETRIES) {
      throw new Error(`Ticketmaster API error: 429 on ${path} after ${MAX_429_RETRIES} retries`);
    }
    const retryAfter = Number(res.headers.get('Retry-After') ?? '0');
    const delayMs = retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_DELAY_MS;
    logger.warn({ delayMs, retryCount }, 'Ticketmaster rate limited (429), backing off');
    await new Promise((r) => setTimeout(r, delayMs));
    return tmFetch<T>(path, params, retryCount + 1);
  }

  if (!res.ok) {
    throw new Error(`Ticketmaster API error: ${res.status} on ${path}`);
  }

  return (await res.json()) as T;
}

export { isConfigured, tmFetch };
