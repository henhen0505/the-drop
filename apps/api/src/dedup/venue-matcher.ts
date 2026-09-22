import { eq, sql } from 'drizzle-orm';
import type { SourceType } from '@the-drop/types';
import { venues } from '../db/schema/venues';
import { slugify, slugifyWithSuffix } from '../utils/slug';
import { VENUE_REUSE_THRESHOLD } from './config';
import { confidenceForSource } from './merge-rules';
import { normalize } from './normalizer';
import { trigramSimilarity } from './similarity';
import type { DbTx, NormalizedEvent } from './types';

/**
 * Finds or creates the canonical venue for an incoming event. Order: provider venue ID,
 * then fuzzy name match within the city, then create. Returns null when the source gave us
 * no venue name/city to work with (venues.city is NOT NULL).
 */
export async function resolveVenue(
  tx: DbTx,
  incoming: NormalizedEvent,
  source: SourceType,
): Promise<string | null> {
  if (!incoming.venueName || !incoming.venueCity) return null;

  if (incoming.venueTicketmasterId) {
    const [hit] = await tx
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.ticketmasterId, incoming.venueTicketmasterId))
      .limit(1);
    if (hit) return hit.id;
  }

  if (incoming.venueSeatgeekId) {
    const [hit] = await tx
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.seatgeekId, incoming.venueSeatgeekId))
      .limit(1);
    if (hit) return hit.id;
  }

  const inCity = await tx
    .select({
      id: venues.id,
      name: venues.name,
      ticketmasterId: venues.ticketmasterId,
      seatgeekId: venues.seatgeekId,
    })
    .from(venues)
    .where(sql`lower(${venues.city}) = ${incoming.venueCity.toLowerCase()}`);

  const incomingName = normalize(incoming.venueName, 'venue');
  let best: (typeof inCity)[number] | null = null;
  let bestScore = 0;
  for (const venue of inCity) {
    const score = trigramSimilarity(incomingName, normalize(venue.name, 'venue'));
    if (score >= VENUE_REUSE_THRESHOLD && score > bestScore) {
      best = venue;
      bestScore = score;
    }
  }

  if (best) {
    const backfill: { ticketmasterId?: string; seatgeekId?: string } = {};
    if (!best.ticketmasterId && incoming.venueTicketmasterId) {
      backfill.ticketmasterId = incoming.venueTicketmasterId;
    }
    if (!best.seatgeekId && incoming.venueSeatgeekId) {
      backfill.seatgeekId = incoming.venueSeatgeekId;
    }
    if (Object.keys(backfill).length > 0) {
      await tx.update(venues).set({ ...backfill, updatedAt: new Date() }).where(eq(venues.id, best.id));
    }
    return best.id;
  }

  const baseSlug = slugify(incoming.venueName);
  const [slugTaken] = await tx
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.slug, baseSlug))
    .limit(1);

  const [created] = await tx
    .insert(venues)
    .values({
      name: incoming.venueName,
      slug: slugTaken ? slugifyWithSuffix(incoming.venueName) : baseSlug,
      city: incoming.venueCity,
      state: incoming.venueState?.toUpperCase() ?? null,
      country: 'US',
      ticketmasterId: incoming.venueTicketmasterId,
      seatgeekId: incoming.venueSeatgeekId,
      primarySource: source,
      confidence: confidenceForSource(source),
      fieldProvenance: { name: source, city: source },
      lastVerifiedAt: new Date(),
    })
    .returning({ id: venues.id });

  if (!created) throw new Error('Failed to create venue');
  return created.id;
}
