import { eq, or, sql } from 'drizzle-orm';
import type { SourceType } from '@the-drop/types';
import { artists } from '../db/schema/artists';
import { eventArtists, events } from '../db/schema/events';
import { slugify, slugifyWithSuffix } from '../utils/slug';
import { normalize } from './normalizer';
import type { DbTx } from './types';

async function findOrCreateArtist(
  tx: DbTx,
  name: string,
  source: SourceType,
): Promise<string | null> {
  let baseSlug: string;
  try {
    baseSlug = slugify(name);
  } catch {
    return null;
  }

  const [existing] = await tx
    .select({ id: artists.id })
    .from(artists)
    .where(or(sql`lower(${artists.name}) = ${name.toLowerCase()}`, eq(artists.slug, baseSlug)))
    .orderBy(sql`${artists.spotifyId} is null`, sql`${artists.followerCount} desc`)
    .limit(1);
  if (existing) return existing.id;

  const [slugTaken] = await tx
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.slug, baseSlug))
    .limit(1);

  const [created] = await tx
    .insert(artists)
    .values({
      name,
      slug: slugTaken ? slugifyWithSuffix(name) : baseSlug,
      primarySource: source,
      confidence: 'UNVERIFIED',
      fieldProvenance: { name: source },
      lastVerifiedAt: new Date(),
    })
    .returning({ id: artists.id });

  return created?.id ?? null;
}

/**
 * Unions the incoming lineup into the event's artists (spec: "do not remove artists").
 * Names with no matching artist row get an UNVERIFIED stub that the artist-refresh job can enrich.
 * The first artist of an event that has no lineup yet is marked headliner.
 */
export async function linkArtistsToEvent(
  tx: DbTx,
  eventId: string,
  artistNames: string[],
  source: SourceType,
): Promise<void> {
  const existing = await tx
    .select({ artistId: eventArtists.artistId, sortOrder: eventArtists.sortOrder })
    .from(eventArtists)
    .where(eq(eventArtists.eventId, eventId));

  const linked = new Set(existing.map((row) => row.artistId));
  let nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);
  const hadLineup = existing.length > 0;

  const seenNames = new Set<string>();
  for (const name of artistNames) {
    const key = normalize(name, 'artist');
    if (!key || seenNames.has(key)) continue;
    seenNames.add(key);

    const artistId = await findOrCreateArtist(tx, name, source);
    if (!artistId || linked.has(artistId)) continue;

    await tx.insert(eventArtists).values({
      eventId,
      artistId,
      isHeadliner: !hadLineup && linked.size === 0,
      sortOrder: nextOrder++,
    });
    linked.add(artistId);
  }

  if (linked.size !== existing.length) {
    await tx.update(events).set({ artistCount: linked.size }).where(eq(events.id, eventId));
  }
}
