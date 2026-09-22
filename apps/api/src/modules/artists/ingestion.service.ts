import { eq } from 'drizzle-orm';
import type { SourceType } from '@the-drop/types';
import { db } from '../../db/client';
import { artists } from '../../db/schema/artists';
import {
  searchArtists as spotifySearch,
  getArtist as spotifyGet,
  isSpotifyConfigured,
} from '../../integrations/spotify';
import { getArtistInfo, isLastfmConfigured } from '../../integrations/lastfm';
import { lookupBySpotifyId } from '../../integrations/musicbrainz';
import type { SpotifyArtistResult } from '../../integrations/spotify';
import type { LastfmArtistResult } from '../../integrations/lastfm';
import type { MusicBrainzArtistResult } from '../../integrations/musicbrainz';
import { slugify, slugifyWithSuffix } from '../../utils/slug';
import { NotImplementedError } from '../../utils/errors';
import { matchGenres, linkArtistGenres } from './genre-linker';

type FieldProvenance = Record<string, SourceType>;

interface MergedArtistData {
  name: string;
  imageUrl: string | null;
  bio: string | null;
  spotifyId: string | null;
  lastfmId: string | null;
  musicbrainzId: string | null;
  spotifyUrl: string | null;
  primarySource: SourceType;
  confidence: 'UNVERIFIED' | 'TRUSTED_SOURCE';
  fieldProvenance: FieldProvenance;
  externalTags: string[];
}

export function mergeSourceData(
  spotify: SpotifyArtistResult | null,
  lastfm: LastfmArtistResult | null,
  musicbrainz: MusicBrainzArtistResult | null,
): MergedArtistData {
  const provenance: FieldProvenance = {};
  const externalTags: string[] = [];

  let name = '';
  let imageUrl: string | null = null;
  let bio: string | null = null;
  let spotifyId: string | null = null;
  let lastfmId: string | null = null;
  let musicbrainzId: string | null = null;
  let spotifyUrl: string | null = null;
  let primarySource: SourceType = 'ADMIN';
  let confidence: 'UNVERIFIED' | 'TRUSTED_SOURCE' = 'UNVERIFIED';

  // MusicBrainz (lowest priority — set first, overwritten by higher)
  if (musicbrainz) {
    name = musicbrainz.name;
    provenance.name = 'MUSICBRAINZ';
    musicbrainzId = musicbrainz.mbid;
    provenance.musicbrainzId = 'MUSICBRAINZ';
    primarySource = 'MUSICBRAINZ';
  }

  // Last.fm (mid priority)
  if (lastfm) {
    name = lastfm.name;
    provenance.name = 'LASTFM';
    if (lastfm.bio) {
      bio = lastfm.bio;
      provenance.bio = 'LASTFM';
    }
    if (lastfm.mbid && !musicbrainzId) {
      musicbrainzId = lastfm.mbid;
      provenance.musicbrainzId = 'LASTFM';
    }
    lastfmId = lastfm.name;
    provenance.lastfmId = 'LASTFM';
    externalTags.push(...lastfm.tags);
    primarySource = 'LASTFM';
  }

  // Spotify (highest priority — overwrites shared fields)
  if (spotify) {
    name = spotify.name;
    provenance.name = 'SPOTIFY';
    imageUrl = spotify.imageUrl;
    provenance.imageUrl = 'SPOTIFY';
    spotifyId = spotify.spotifyId;
    provenance.spotifyId = 'SPOTIFY';
    spotifyUrl = spotify.spotifyUrl;
    provenance.spotifyUrl = 'SPOTIFY';
    externalTags.push(...spotify.genres);
    primarySource = 'SPOTIFY';
    confidence = 'TRUSTED_SOURCE';
  }

  return {
    name,
    imageUrl,
    bio,
    spotifyId,
    lastfmId,
    musicbrainzId,
    spotifyUrl,
    primarySource,
    confidence,
    fieldProvenance: provenance,
    externalTags,
  };
}

async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = slugify(name);
  const [existing] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.slug, baseSlug))
    .limit(1);
  if (!existing) return baseSlug;
  return slugifyWithSuffix(name);
}

export interface IngestResult {
  artistId: string;
  name: string;
  slug: string;
  isNew: boolean;
  sources: SourceType[];
  genresLinked: number;
}

export async function ingestBySpotifyId(
  spotifyId: string,
): Promise<IngestResult> {
  if (!isSpotifyConfigured()) {
    throw new NotImplementedError('Spotify is not configured');
  }

  const [existing] = await db
    .select({ id: artists.id, name: artists.name, slug: artists.slug })
    .from(artists)
    .where(eq(artists.spotifyId, spotifyId))
    .limit(1);

  const spotifyData = await spotifyGet(spotifyId);

  let lastfmData: LastfmArtistResult | null = null;
  if (isLastfmConfigured()) {
    lastfmData = await getArtistInfo(spotifyData.name);
  }

  const mbData = await lookupBySpotifyId(spotifyId);

  const merged = mergeSourceData(spotifyData, lastfmData, mbData);
  const sources: SourceType[] = ['SPOTIFY'];
  if (lastfmData) sources.push('LASTFM');
  if (mbData) sources.push('MUSICBRAINZ');

  const genreIds = await matchGenres(merged.externalTags);

  if (existing) {
    await db
      .update(artists)
      .set({
        name: merged.name,
        imageUrl: merged.imageUrl,
        bio: merged.bio,
        spotifyId: merged.spotifyId,
        lastfmId: merged.lastfmId,
        musicbrainzId: merged.musicbrainzId,
        spotifyUrl: merged.spotifyUrl,
        primarySource: merged.primarySource,
        confidence: merged.confidence,
        fieldProvenance: merged.fieldProvenance,
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(artists.id, existing.id));

    await linkArtistGenres(existing.id, genreIds);

    return {
      artistId: existing.id,
      name: merged.name,
      slug: existing.slug,
      isNew: false,
      sources,
      genresLinked: genreIds.length,
    };
  }

  const slug = await generateUniqueSlug(merged.name);
  const [created] = await db
    .insert(artists)
    .values({
      name: merged.name,
      slug,
      imageUrl: merged.imageUrl,
      bio: merged.bio,
      spotifyId: merged.spotifyId,
      lastfmId: merged.lastfmId,
      musicbrainzId: merged.musicbrainzId,
      spotifyUrl: merged.spotifyUrl,
      primarySource: merged.primarySource,
      confidence: merged.confidence,
      fieldProvenance: merged.fieldProvenance,
      lastVerifiedAt: new Date(),
    })
    .returning();

  if (!created) throw new Error('Failed to create artist');

  await linkArtistGenres(created.id, genreIds);

  return {
    artistId: created.id,
    name: merged.name,
    slug,
    isNew: true,
    sources,
    genresLinked: genreIds.length,
  };
}

export async function searchAndIngest(
  query: string,
  limit = 5,
): Promise<IngestResult[]> {
  if (!isSpotifyConfigured()) {
    throw new NotImplementedError('Spotify is not configured');
  }

  const spotifyResults = await spotifySearch(query, limit);
  if (spotifyResults.length === 0) return [];

  const results: IngestResult[] = [];
  for (const result of spotifyResults) {
    const ingested = await ingestBySpotifyId(result.spotifyId);
    results.push(ingested);
  }

  return results;
}
