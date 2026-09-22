import { NotImplementedError } from '../../utils/errors';
import { isConfigured, lastfmFetch } from './lastfm.client';
import type { LastfmArtistInfoResponse, LastfmArtistResult } from './lastfm.types';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function normalizeArtistInfo(raw: LastfmArtistInfoResponse['artist']): LastfmArtistResult {
  const bio = raw.bio?.summary ? stripHtml(raw.bio.summary) : null;
  // Remove Last.fm's "Read more on Last.fm" suffix that appears in summaries
  const cleanBio = bio?.replace(/\s*Read more on Last\.fm.*$/i, '').trim() || null;

  const rawTags = raw.tags?.tag;
  const tags = Array.isArray(rawTags)
    ? rawTags.map((t) => t.name)
    : rawTags
      ? [rawTags.name]
      : [];

  const rawSimilar = raw.similar?.artist;
  const similarArtists = Array.isArray(rawSimilar)
    ? rawSimilar.map((a) => a.name)
    : rawSimilar
      ? [rawSimilar.name]
      : [];

  return {
    name: raw.name,
    mbid: raw.mbid || null,
    bio: cleanBio,
    tags,
    similarArtists,
    listeners: Number(raw.stats?.listeners ?? '0'),
    playcount: Number(raw.stats?.playcount ?? '0'),
  };
}

export async function getArtistInfo(artistName: string): Promise<LastfmArtistResult | null> {
  if (!isConfigured()) throw new NotImplementedError('Last.fm is not configured');

  try {
    const data = await lastfmFetch<LastfmArtistInfoResponse>({
      method: 'artist.getinfo',
      artist: artistName,
      autocorrect: '1',
    });

    if (!data.artist) return null;
    return normalizeArtistInfo(data.artist);
  } catch {
    return null;
  }
}
