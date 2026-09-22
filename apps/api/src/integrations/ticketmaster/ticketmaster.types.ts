// Raw Ticketmaster Discovery v2 response types (only the fields we use). Mirrors the local
// TicketmasterRaw interface in dedup/extractors.ts -- keep the two in sync if either changes.
export interface TicketmasterEventRaw {
  id?: string;
  name?: string;
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

export interface TicketmasterSearchResponse {
  // Absent entirely (not an empty array) when the query matches 0 events.
  _embedded?: { events: TicketmasterEventRaw[] };
  _links?: { next?: { href: string } };
  page: { size: number; totalElements: number; totalPages: number; number: number };
}

export interface TicketmasterSearchParams {
  stateCode: string;
  classificationName: string;
  startDateTime: string;
  endDateTime: string;
  size: string;
  page: string;
}
