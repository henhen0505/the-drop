import { and, eq, sql } from 'drizzle-orm';
import type { SourceType, VendorClassification } from '@the-drop/types';
import { eventExternalIds, eventSources } from '../db/schema/event-sources';
import { events } from '../db/schema/events';
import { ticketLinks } from '../db/schema/ticket-links';
import { slugify, slugifyWithSuffix } from '../utils/slug';
import { linkArtistsToEvent } from './artist-linker';
import { confidenceForSource, planFieldMerge } from './merge-rules';
import type { ExistingEventFields } from './merge-rules';
import type { DbTx, NormalizedEvent, SourceRecord } from './types';

const VENDORS: Partial<Record<SourceType, { name: string; classification: VendorClassification }>> = {
  TICKETMASTER: { name: 'Ticketmaster', classification: 'OFFICIAL' },
  SEATGEEK: { name: 'SeatGeek', classification: 'VERIFIED_RESALE' },
};

async function upsertSourceRecords(
  tx: DbTx,
  eventId: string,
  incoming: NormalizedEvent,
  source: SourceRecord,
): Promise<void> {
  const values = {
    eventId,
    sourceType: source.sourceType,
    externalId: source.externalId,
    sourceUrl: incoming.sourceUrl,
    rawData: source.rawData ?? null,
    lastSyncedAt: new Date(),
  };

  if (source.externalId) {
    await tx
      .insert(eventSources)
      .values(values)
      .onConflictDoUpdate({
        target: [eventSources.sourceType, eventSources.externalId],
        set: { rawData: values.rawData, sourceUrl: values.sourceUrl, lastSyncedAt: values.lastSyncedAt },
      });
    await tx
      .insert(eventExternalIds)
      .values({ eventId, sourceType: source.sourceType, externalId: source.externalId })
      .onConflictDoNothing();
  } else {
    await tx.insert(eventSources).values(values);
  }
}

/**
 * Spec Step 6 keeps every source's links without de-duplicating across sources. A source's own
 * link is replaced (not appended) on re-sync so repeated syncs don't pile up copies of one URL.
 */
async function replaceTicketLinks(
  tx: DbTx,
  eventId: string,
  incoming: NormalizedEvent,
  source: SourceType,
): Promise<void> {
  if (!incoming.ticketUrl) return;

  const vendor = VENDORS[source] ?? { name: 'Other', classification: 'OFFICIAL' as const };
  await tx
    .delete(ticketLinks)
    .where(and(eq(ticketLinks.eventId, eventId), eq(ticketLinks.sourceType, source)));
  await tx.insert(ticketLinks).values({
    eventId,
    vendorName: vendor.name,
    vendorClassification: vendor.classification,
    url: incoming.ticketUrl,
    priceMinCents: incoming.priceMinCents,
    priceMaxCents: incoming.priceMaxCents,
    currency: 'USD',
    sourceType: source,
    lastCheckedAt: new Date(),
  });

  await tx
    .update(events)
    .set({
      minPriceCents: sql`(select min(${ticketLinks.priceMinCents}) from ${ticketLinks} where ${ticketLinks.eventId} = ${eventId})`,
    })
    .where(eq(events.id, eventId));
}

export async function mergeIntoEvent(
  tx: DbTx,
  eventId: string,
  incoming: NormalizedEvent,
  source: SourceRecord,
  resolvedVenueId: string | null,
): Promise<void> {
  const [event] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new Error(`Cannot merge into missing event ${eventId}`);

  const existing: ExistingEventFields = {
    title: event.title,
    description: event.description,
    imageUrl: event.imageUrl,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venueId: event.venueId,
    confidence: event.confidence,
    primarySource: event.primarySource,
    fieldProvenance: (event.fieldProvenance ?? {}) as Record<string, string>,
    status: event.status,
  };
  const plan = planFieldMerge(existing, { ...incoming, resolvedVenueId }, source.sourceType);

  await tx
    .update(events)
    .set({
      ...plan.updates,
      // Curated field that only human sources (community submissions) provide: fill a gap, never overwrite.
      ...(incoming.ageRestriction && !event.ageRestriction
        ? { ageRestriction: incoming.ageRestriction }
        : {}),
      fieldProvenance: plan.provenance,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  await upsertSourceRecords(tx, eventId, incoming, source);
  await linkArtistsToEvent(tx, eventId, incoming.artistNames, source.sourceType);
  await replaceTicketLinks(tx, eventId, incoming, source.sourceType);
}

export async function generateEventSlug(tx: DbTx, title: string, startsAt: Date): Promise<string> {
  const label = `${title} ${startsAt.toISOString().slice(0, 10)}`;
  let base: string;
  try {
    base = slugify(label);
  } catch {
    return slugifyWithSuffix('event');
  }
  const [taken] = await tx.select({ id: events.id }).from(events).where(eq(events.slug, base)).limit(1);
  return taken ? slugifyWithSuffix(label) : base;
}

export async function createCanonicalEvent(
  tx: DbTx,
  incoming: NormalizedEvent,
  source: SourceRecord,
  resolvedVenueId: string | null,
): Promise<string> {
  const startsAt = new Date(incoming.startsAt);
  const provenance: Record<string, string> = { title: source.sourceType, startsAt: source.sourceType };
  if (incoming.description) provenance.description = source.sourceType;
  if (incoming.imageUrl) provenance.imageUrl = source.sourceType;
  if (incoming.endsAt) provenance.endsAt = source.sourceType;
  if (resolvedVenueId) provenance.venueId = source.sourceType;
  if (incoming.status) provenance.status = source.sourceType;

  const slug = await generateEventSlug(tx, incoming.title, startsAt);
  const [created] = await tx
    .insert(events)
    .values({
      title: incoming.title,
      slug,
      description: incoming.description,
      imageUrl: incoming.imageUrl,
      startsAt,
      endsAt: incoming.endsAt ? new Date(incoming.endsAt) : null,
      venueId: resolvedVenueId,
      ageRestriction: incoming.ageRestriction ?? null,
      primarySource: source.sourceType,
      sourceUrl: incoming.sourceUrl,
      confidence: confidenceForSource(source.sourceType),
      fieldProvenance: provenance,
      lastVerifiedAt: new Date(),
      // A source's status carries through to a brand-new canonical event too (e.g. a listing
      // that is already POSTPONED when it's first seen), instead of always defaulting to PUBLISHED.
      ...(incoming.status ? { status: incoming.status } : {}),
    })
    .returning({ id: events.id });
  if (!created) throw new Error('Failed to create canonical event');

  await upsertSourceRecords(tx, created.id, incoming, source);
  await linkArtistsToEvent(tx, created.id, incoming.artistNames, source.sourceType);
  await replaceTicketLinks(tx, created.id, incoming, source.sourceType);
  return created.id;
}
