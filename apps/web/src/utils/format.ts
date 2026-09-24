/** Formats an event's start time in the event's own timezone (not the
 * viewer's local timezone) -- an event's date/time only makes sense
 * relative to where it's happening. */
export function formatEventDateTime(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(startsAt));
}

/** Event-card-style minimum price, e.g. "$45+". Null (price unknown) renders
 * as "Price TBD". */
export function formatMinPrice(minPriceCents: number | null): string {
  if (minPriceCents === null) return 'Price TBD';
  return `$${(minPriceCents / 100).toFixed(0)}+`;
}

/** Ticket-link-style price range, e.g. "$45 - $60" or "$45" when min===max.
 * Falls back to a single "$N+" when only one bound is known, and "Price TBD"
 * when neither is. */
export function formatPriceRange(minCents: number | null, maxCents: number | null): string {
  if (minCents === null && maxCents === null) return 'Price TBD';
  const min = minCents !== null ? (minCents / 100).toFixed(0) : null;
  const max = maxCents !== null ? (maxCents / 100).toFixed(0) : null;
  if (min !== null && max !== null) {
    return min === max ? `$${min}` : `$${min} - $${max}`;
  }
  return `$${min ?? max}+`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Notification-row-style relative timestamp, e.g. "just now"/"5m ago"/
 * "2h ago"/"Yesterday", falling back to a short date past 2 days. */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();

  if (diffMs < MINUTE_MS) return 'just now';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}h ago`;
  if (diffMs < 2 * DAY_MS) return 'Yesterday';

  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}
