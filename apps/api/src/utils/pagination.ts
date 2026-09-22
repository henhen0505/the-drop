import { ValidationError } from './errors';

/**
 * Cursor-based pagination helpers, per architecture/api-contracts.md:
 * the cursor is an opaque base64-encoded JSON object of the last item's
 * sort key. Clients must not parse it themselves; callers on the server
 * side use encode/decode to round-trip the sort key.
 */

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function encodeCursor(sortKey: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(sortKey), 'utf8').toString('base64url');
}

/**
 * Decodes a cursor produced by encodeCursor. Cursors arrive as raw query
 * params (a system boundary), so a malformed value must fail loudly with
 * a 400 rather than throwing an uncaught JSON parse error deep in a query
 * builder.
 */
export function decodeCursor<T extends Record<string, unknown> = Record<string, unknown>>(
  cursor: string,
): T {
  let decoded: unknown;

  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    decoded = JSON.parse(json);
  } catch {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }

  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }

  return decoded as T;
}

/**
 * Parses and clamps a client-supplied `limit` query param to
 * [1, MAX_PAGE_LIMIT], defaulting to DEFAULT_PAGE_LIMIT when absent.
 */
export function parseLimit(rawLimit: unknown): number {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    return DEFAULT_PAGE_LIMIT;
  }

  const parsed = Number(rawLimit);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError('limit must be a positive integer', { field: 'limit' });
  }

  return Math.min(parsed, MAX_PAGE_LIMIT);
}

const UUID_CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decodes a keyset cursor made of an ISO timestamp under `field` plus a UUID `id`,
 * rejecting anything else with a 400 instead of letting it reach a query.
 */
export function decodeTimestampIdCursor(
  cursor: string,
  field: string,
): { at: string; id: string } {
  const decoded = decodeCursor(cursor);
  const at = decoded[field];
  const id = decoded.id;
  if (
    typeof at !== 'string' ||
    Number.isNaN(Date.parse(at)) ||
    typeof id !== 'string' ||
    !UUID_CURSOR_ID.test(id)
  ) {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }
  return { at, id };
}
