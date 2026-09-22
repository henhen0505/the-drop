import type { EventStatus, SourceType } from '@the-drop/types';
import type { NormalizedEvent } from './types';

/*
 * Turns a staged raw payload into the common NormalizedEvent shape. The TM / SG field paths
 * below come from the providers' public API shapes and have not been checked against live
 * responses yet; verify them when the Package 3 adapters land.
 */

interface TicketmasterRaw {
  name?: string;
  id?: string;
  url?: string;
  info?: string;
  dates?: {
    start?: { dateTime?: string; localDate?: string };
    end?: { dateTime?: string };
    status?: { code?: string };
  };
  _embedded?: {
    venues?: Array<{
      id?: string;
      name?: string;
      city?: { name?: string };
      state?: { stateCode?: string };
    }>;
    attractions?: Array<{ name?: string }>;
  };
  images?: Array<{ url?: string; width?: number }>;
  priceRanges?: Array<{ min?: number; max?: number }>;
}

interface SeatGeekRaw {
  id?: number;
  title?: string;
  url?: string;
  description?: string;
  datetime_utc?: string;
  venue?: { id?: number; name?: string; city?: string; state?: string };
  performers?: Array<{ name?: string }>;
  stats?: { lowest_price?: number; highest_price?: number };
}

interface CommunityRaw {
  title?: string;
  startsAt?: string;
  endsAt?: string;
  venueName?: string;
  venueCity?: string;
  venueState?: string;
  artistNames?: string[];
  description?: string;
  imageUrl?: string;
  ticketUrl?: string;
  sourceUrl?: string;
  ageRestriction?: string;
}

/**
 * Provider timestamps sometimes omit the offset; JS would read those as server-local time.
 * Date-only values get midday UTC so the calendar day stays correct in every US timezone.
 */
export function toIsoUtc(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00Z`;
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value)) return value;
  return `${value}Z`;
}

function toCents(dollars: number | undefined): number | null {
  return dollars != null ? Math.round(dollars * 100) : null;
}

function names(list: Array<{ name?: string }> | undefined): string[] {
  return (list ?? []).map((item) => item.name?.trim()).filter((n): n is string => !!n);
}

/** Only cancellation/postponement codes override status; 'onsale'/'offsale' carry no status change. */
function mapTicketmasterStatus(code: string | undefined): EventStatus | undefined {
  switch (code) {
    case 'cancelled':
      return 'CANCELLED';
    case 'postponed':
    case 'rescheduled':
      return 'POSTPONED';
    default:
      return undefined;
  }
}

function fromTicketmaster(raw: TicketmasterRaw): NormalizedEvent {
  const venue = raw._embedded?.venues?.[0];
  const image = raw.images?.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  const price = raw.priceRanges?.[0];

  return {
    title: raw.name?.trim() ?? '',
    startsAt: toIsoUtc(raw.dates?.start?.dateTime ?? raw.dates?.start?.localDate),
    endsAt: raw.dates?.end?.dateTime ? toIsoUtc(raw.dates.end.dateTime) : null,
    venueName: venue?.name ?? null,
    venueCity: venue?.city?.name ?? null,
    venueState: venue?.state?.stateCode ?? null,
    venueTicketmasterId: venue?.id ?? null,
    venueSeatgeekId: null,
    artistNames: names(raw._embedded?.attractions),
    description: raw.info ?? null,
    imageUrl: image?.url ?? null,
    ticketUrl: raw.url ?? null,
    priceMinCents: toCents(price?.min),
    priceMaxCents: toCents(price?.max),
    sourceUrl: raw.url ?? null,
    externalId: raw.id ?? null,
    status: mapTicketmasterStatus(raw.dates?.status?.code),
  };
}

function fromSeatGeek(raw: SeatGeekRaw): NormalizedEvent {
  return {
    title: raw.title?.trim() ?? '',
    startsAt: toIsoUtc(raw.datetime_utc),
    endsAt: null,
    venueName: raw.venue?.name ?? null,
    venueCity: raw.venue?.city ?? null,
    venueState: raw.venue?.state ?? null,
    venueTicketmasterId: null,
    venueSeatgeekId: raw.venue?.id != null ? String(raw.venue.id) : null,
    artistNames: names(raw.performers),
    description: raw.description || null,
    imageUrl: null,
    ticketUrl: raw.url ?? null,
    priceMinCents: toCents(raw.stats?.lowest_price),
    priceMaxCents: toCents(raw.stats?.highest_price),
    sourceUrl: raw.url ?? null,
    externalId: raw.id != null ? String(raw.id) : null,
  };
}

function fromCommunity(raw: CommunityRaw): NormalizedEvent {
  return {
    title: raw.title?.trim() ?? '',
    startsAt: toIsoUtc(raw.startsAt),
    endsAt: raw.endsAt ? toIsoUtc(raw.endsAt) : null,
    venueName: raw.venueName ?? null,
    venueCity: raw.venueCity ?? null,
    venueState: raw.venueState ?? null,
    venueTicketmasterId: null,
    venueSeatgeekId: null,
    artistNames: (raw.artistNames ?? []).map((n) => n.trim()).filter(Boolean),
    description: raw.description ?? null,
    imageUrl: raw.imageUrl ?? null,
    ticketUrl: raw.ticketUrl ?? null,
    priceMinCents: null,
    priceMaxCents: null,
    sourceUrl: raw.sourceUrl ?? null,
    externalId: null,
    ageRestriction: raw.ageRestriction ?? null,
  };
}

export function extractEvent(sourceType: SourceType, rawData: unknown): NormalizedEvent {
  const raw = (rawData ?? {}) as object;
  switch (sourceType) {
    case 'TICKETMASTER':
      return fromTicketmaster(raw as TicketmasterRaw);
    case 'SEATGEEK':
      return fromSeatGeek(raw as SeatGeekRaw);
    case 'COMMUNITY':
    case 'ADMIN':
      return fromCommunity(raw as CommunityRaw);
    default:
      throw new Error(`No event extractor for source type ${sourceType}`);
  }
}

/** Returns a human-readable problem, or null when the event can enter the pipeline. */
export function validateNormalized(event: NormalizedEvent): string | null {
  if (!event.title) return 'missing title';
  if (!event.startsAt || Number.isNaN(new Date(event.startsAt).getTime())) {
    return 'missing or unparseable start time';
  }
  if (event.endsAt && Number.isNaN(new Date(event.endsAt).getTime())) {
    return 'unparseable end time';
  }
  return null;
}
