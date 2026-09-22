import { and, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { artists } from '../../db/schema/artists';
import { ingestBySpotifyId } from '../../modules/artists/ingestion.service';
import { logger } from '../../utils/logger';
import type { JobMessage } from '../poller';

const BATCH_SIZE = 50;

export async function handleArtistRefresh(_message: JobMessage): Promise<void> {
  const candidates = await db
    .select({ id: artists.id, spotifyId: artists.spotifyId })
    .from(artists)
    .where(
      and(
        isNotNull(artists.spotifyId),
        or(
          isNull(artists.lastVerifiedAt),
          sql`${artists.lastVerifiedAt} < now() - interval '7 days'`,
        ),
      ),
    )
    .orderBy(sql`${artists.lastVerifiedAt} asc nulls first`)
    .limit(BATCH_SIZE);

  let refreshed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (!candidate.spotifyId) continue; // isNotNull above guarantees this; keeps TS honest
    try {
      await ingestBySpotifyId(candidate.spotifyId);
      refreshed++;
    } catch (err) {
      failed++;
      logger.error(
        { artistId: candidate.id, err },
        'Artist refresh failed for one artist, continuing',
      );
    }
  }

  logger.info({ refreshed, failed, total: candidates.length }, 'Artist refresh job complete');
}
