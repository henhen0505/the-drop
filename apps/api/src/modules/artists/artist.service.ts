import { and, asc, count, eq, gte, ilike, inArray, sql } from 'drizzle-orm';
import type { ConfidenceLevel, SourceType } from '@the-drop/types';
import { db } from '../../db/client';
import { artistGenres, artists } from '../../db/schema/artists';
import { eventArtists, events } from '../../db/schema/events';
import { genres } from '../../db/schema/genres';
import { userArtistFollows } from '../../db/schema/user-event-states';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors';
import { decodeCursor, encodeCursor, parseLimit } from '../../utils/pagination';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ArtistCursor {
  name: string;
  id: string;
}

export interface ArtistGenreSummary {
  id: string;
  name: string;
}

export interface ArtistGenreDetail extends ArtistGenreSummary {
  slug: string;
}

export interface ArtistListItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  genres: ArtistGenreSummary[];
  followerCount: number;
  spotifyUrl: string | null;
  isFollowed: boolean;
}

export interface ArtistDetail {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  bio: string | null;
  genres: ArtistGenreDetail[];
  spotifyUrl: string | null;
  soundcloudUrl: string | null;
  appleMusicUrl: string | null;
  followerCount: number;
  isFollowed: boolean;
  confidence: ConfidenceLevel;
  primarySource: SourceType;
  upcomingEventCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowArtistResult {
  artistId: string;
  followedAt: Date;
}

export interface FollowedArtistItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  genres: ArtistGenreSummary[];
  followerCount: number;
  spotifyUrl: string | null;
  followedAt: Date;
}

export interface ListArtistsOptions {
  q?: string;
  genre?: string;
  cursor?: string;
  limit?: number;
  userId?: string;
}

export interface ListArtistsResult {
  data: ArtistListItem[];
  cursor: string | null;
}

export interface FollowedArtistsOptions {
  cursor?: string;
  limit?: number;
}

export interface FollowedArtistsResult {
  data: FollowedArtistItem[];
  cursor: string | null;
}

/** Decodes and validates a list-artists pagination cursor's shape. */
function decodeArtistCursor(cursor: string): ArtistCursor {
  const decoded = decodeCursor<{ name?: unknown; id?: unknown }>(cursor);
  if (typeof decoded.name !== 'string' || typeof decoded.id !== 'string') {
    throw new ValidationError('Invalid pagination cursor', { field: 'cursor' });
  }
  return { name: decoded.name, id: decoded.id };
}

/** Fetches genres for a batch of artist IDs in a single query. */
async function fetchGenresForArtists(artistIds: string[]): Promise<Map<string, ArtistGenreDetail[]>> {
  const genresByArtist = new Map<string, ArtistGenreDetail[]>();
  if (artistIds.length === 0) {
    return genresByArtist;
  }

  const rows = await db
    .select({
      artistId: artistGenres.artistId,
      id: genres.id,
      name: genres.name,
      slug: genres.slug,
    })
    .from(artistGenres)
    .innerJoin(genres, eq(genres.id, artistGenres.genreId))
    .where(inArray(artistGenres.artistId, artistIds));

  for (const row of rows) {
    const list = genresByArtist.get(row.artistId) ?? [];
    list.push({ id: row.id, name: row.name, slug: row.slug });
    genresByArtist.set(row.artistId, list);
  }

  return genresByArtist;
}

/** Postgres unique_violation. Drizzle surfaces the raw pg error, not a typed wrapper. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

export async function listArtists(opts: ListArtistsOptions): Promise<ListArtistsResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeArtistCursor(opts.cursor) : undefined;

  const conditions = [];
  if (opts.q) {
    conditions.push(ilike(artists.name, `%${opts.q}%`));
  }
  if (opts.genre) {
    conditions.push(
      sql`exists (select 1 from ${artistGenres} inner join ${genres} on ${genres.id} = ${artistGenres.genreId} where ${artistGenres.artistId} = ${artists.id} and ${genres.slug} = ${opts.genre})`,
    );
  }
  if (cursorData) {
    conditions.push(
      sql`(${artists.name}, ${artists.id}) > (${cursorData.name}, ${cursorData.id})`,
    );
  }

  const followJoinCondition = opts.userId
    ? and(eq(userArtistFollows.artistId, artists.id), eq(userArtistFollows.userId, opts.userId))
    : sql`false`;

  const rows = await db
    .select({
      id: artists.id,
      name: artists.name,
      slug: artists.slug,
      imageUrl: artists.imageUrl,
      followerCount: artists.followerCount,
      spotifyUrl: artists.spotifyUrl,
      isFollowed: sql<boolean>`${userArtistFollows.userId} is not null`,
    })
    .from(artists)
    .leftJoin(userArtistFollows, followJoinCondition)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(artists.name), asc(artists.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const genresByArtist = await fetchGenresForArtists(page.map((row) => row.id));

  const data: ArtistListItem[] = page.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageUrl,
    genres: (genresByArtist.get(row.id) ?? []).map((g) => ({ id: g.id, name: g.name })),
    followerCount: row.followerCount,
    spotifyUrl: row.spotifyUrl,
    isFollowed: row.isFollowed,
  }));

  const last = page[page.length - 1];
  const cursor = hasMore && last ? encodeCursor({ name: last.name, id: last.id }) : null;

  return { data, cursor };
}

export async function getArtist(idOrSlug: string, userId?: string): Promise<ArtistDetail> {
  const lookupCondition = UUID_REGEX.test(idOrSlug)
    ? eq(artists.id, idOrSlug)
    : eq(artists.slug, idOrSlug);

  const followJoinCondition = userId
    ? and(eq(userArtistFollows.artistId, artists.id), eq(userArtistFollows.userId, userId))
    : sql`false`;

  const [row] = await db
    .select({
      id: artists.id,
      name: artists.name,
      slug: artists.slug,
      imageUrl: artists.imageUrl,
      bio: artists.bio,
      spotifyUrl: artists.spotifyUrl,
      soundcloudUrl: artists.soundcloudUrl,
      appleMusicUrl: artists.appleMusicUrl,
      followerCount: artists.followerCount,
      confidence: artists.confidence,
      primarySource: artists.primarySource,
      createdAt: artists.createdAt,
      updatedAt: artists.updatedAt,
      isFollowed: sql<boolean>`${userArtistFollows.userId} is not null`,
    })
    .from(artists)
    .leftJoin(userArtistFollows, followJoinCondition)
    .where(lookupCondition)
    .limit(1);

  if (!row) {
    throw new NotFoundError('Artist not found');
  }

  const [genresByArtist, [upcoming]] = await Promise.all([
    fetchGenresForArtists([row.id]),
    db
      .select({ value: count() })
      .from(eventArtists)
      .innerJoin(events, eq(events.id, eventArtists.eventId))
      .where(
        and(
          eq(eventArtists.artistId, row.id),
          eq(events.status, 'PUBLISHED'),
          gte(events.startsAt, sql`now()`),
        ),
      ),
  ]);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageUrl,
    bio: row.bio,
    genres: genresByArtist.get(row.id) ?? [],
    spotifyUrl: row.spotifyUrl,
    soundcloudUrl: row.soundcloudUrl,
    appleMusicUrl: row.appleMusicUrl,
    followerCount: row.followerCount,
    isFollowed: row.isFollowed,
    confidence: row.confidence,
    primarySource: row.primarySource,
    upcomingEventCount: upcoming?.value ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function followArtist(userId: string, artistId: string): Promise<FollowArtistResult> {
  try {
    const followedAt = await db.transaction(async (tx) => {
      const [follow] = await tx
        .insert(userArtistFollows)
        .values({ userId, artistId })
        .returning();
      if (!follow) {
        throw new Error('Failed to create artist follow');
      }

      await tx
        .update(artists)
        .set({ followerCount: sql`${artists.followerCount} + 1` })
        .where(eq(artists.id, artistId));

      return follow.createdAt;
    });

    return { artistId, followedAt };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('Already following this artist');
    }
    throw err;
  }
}

export async function unfollowArtist(userId: string, artistId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(userArtistFollows)
      .where(and(eq(userArtistFollows.userId, userId), eq(userArtistFollows.artistId, artistId)))
      .returning();

    if (deleted.length === 0) {
      throw new NotFoundError('Not following this artist');
    }

    await tx
      .update(artists)
      .set({ followerCount: sql`${artists.followerCount} - 1` })
      .where(eq(artists.id, artistId));
  });
}

export async function getFollowedArtists(
  userId: string,
  opts: FollowedArtistsOptions,
): Promise<FollowedArtistsResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeArtistCursor(opts.cursor) : undefined;

  const conditions = [eq(userArtistFollows.userId, userId)];
  if (cursorData) {
    conditions.push(
      sql`(${artists.name}, ${artists.id}) > (${cursorData.name}, ${cursorData.id})`,
    );
  }

  const rows = await db
    .select({
      id: artists.id,
      name: artists.name,
      slug: artists.slug,
      imageUrl: artists.imageUrl,
      followerCount: artists.followerCount,
      spotifyUrl: artists.spotifyUrl,
      followedAt: userArtistFollows.createdAt,
    })
    .from(userArtistFollows)
    .innerJoin(artists, eq(artists.id, userArtistFollows.artistId))
    .where(and(...conditions))
    .orderBy(asc(artists.name), asc(artists.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const genresByArtist = await fetchGenresForArtists(page.map((row) => row.id));

  const data: FollowedArtistItem[] = page.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageUrl,
    genres: (genresByArtist.get(row.id) ?? []).map((g) => ({ id: g.id, name: g.name })),
    followerCount: row.followerCount,
    spotifyUrl: row.spotifyUrl,
    followedAt: row.followedAt,
  }));

  const last = page[page.length - 1];
  const cursor = hasMore && last ? encodeCursor({ name: last.name, id: last.id }) : null;

  return { data, cursor };
}
