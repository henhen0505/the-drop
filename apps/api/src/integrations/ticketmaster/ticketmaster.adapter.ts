import { NotImplementedError } from '../../utils/errors';
import { isConfigured, tmFetch } from './ticketmaster.client';
import type { TicketmasterEventRaw, TicketmasterSearchResponse } from './ticketmaster.types';

const DEFAULT_PAGE_SIZE = 200;
// Discovery v2 truncates any query where page * size >= 1000, regardless of totalPages.
const RESULT_CEILING = 1000;

export interface SearchEventsParams {
  stateCode: string;
  startDateTime: string;
  endDateTime: string;
  page?: number;
  size?: number;
}

export interface SearchEventsResult {
  events: TicketmasterEventRaw[];
  totalPages: number;
  totalElements: number;
}

export async function searchEvents(params: SearchEventsParams): Promise<SearchEventsResult> {
  if (!isConfigured()) throw new NotImplementedError('Ticketmaster is not configured');

  const size = params.size ?? DEFAULT_PAGE_SIZE;
  const page = params.page ?? 0;
  // Genre-level filtering (e.g. an "electronic" sub-genre) is deferred until a live API key can
  // confirm real classification IDs against GET /discovery/v2/classifications.json.
  const response = await tmFetch<TicketmasterSearchResponse>('events.json', {
    stateCode: params.stateCode,
    classificationName: 'Music',
    startDateTime: params.startDateTime,
    endDateTime: params.endDateTime,
    size: String(size),
    page: String(page),
  });

  return {
    events: response._embedded?.events ?? [],
    totalPages: response.page.totalPages,
    totalElements: response.page.totalElements,
  };
}

export interface FetchAllEventsParams {
  stateCode: string;
  startDateTime: string;
  endDateTime: string;
}

export async function fetchAllEvents(params: FetchAllEventsParams): Promise<TicketmasterEventRaw[]> {
  const size = DEFAULT_PAGE_SIZE;
  const results: TicketmasterEventRaw[] = [];
  let page = 0;

  for (;;) {
    const { events, totalPages } = await searchEvents({ ...params, page, size });
    results.push(...events);

    const reachedCeiling = (page + 1) * size >= RESULT_CEILING;
    const shortPage = events.length < size;
    const lastPage = page >= totalPages - 1;
    if (reachedCeiling || shortPage || lastPage) break;
    page += 1;
  }

  return results;
}
