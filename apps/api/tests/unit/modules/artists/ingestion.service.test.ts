import { describe, expect, it } from 'vitest';
import { mergeSourceData } from '../../../../src/modules/artists/ingestion.service';
import type { SpotifyArtistResult } from '../../../../src/integrations/spotify';
import type { LastfmArtistResult } from '../../../../src/integrations/lastfm';
import type { MusicBrainzArtistResult } from '../../../../src/integrations/musicbrainz';

const SPOTIFY: SpotifyArtistResult = {
  spotifyId: 'sp-123',
  name: 'Skrillex',
  imageUrl: 'https://img.spotify.com/skrillex.jpg',
  spotifyUrl: 'https://open.spotify.com/artist/sp-123',
  genres: ['dubstep', 'edm'],
  popularity: 85,
  followerCount: 15_000_000,
};

const LASTFM: LastfmArtistResult = {
  name: 'Skrillex',
  mbid: 'mb-456',
  bio: 'Skrillex is an American DJ and record producer.',
  tags: ['electronic', 'dubstep', 'bass music'],
  similarArtists: ['Diplo', 'Marshmello'],
  listeners: 5_000_000,
  playcount: 200_000_000,
};

const MUSICBRAINZ: MusicBrainzArtistResult = {
  mbid: 'mb-456',
  name: 'Skrillex',
  disambiguation: 'American electronic musician',
  type: 'Person',
  country: 'US',
};

describe('mergeSourceData', () => {
  it('uses Spotify as highest priority for shared fields', () => {
    const result = mergeSourceData(SPOTIFY, LASTFM, MUSICBRAINZ);

    expect(result.name).toBe('Skrillex');
    expect(result.fieldProvenance.name).toBe('SPOTIFY');
    expect(result.primarySource).toBe('SPOTIFY');
    expect(result.confidence).toBe('TRUSTED_SOURCE');
  });

  it('takes imageUrl from Spotify', () => {
    const result = mergeSourceData(SPOTIFY, LASTFM, MUSICBRAINZ);

    expect(result.imageUrl).toBe('https://img.spotify.com/skrillex.jpg');
    expect(result.fieldProvenance.imageUrl).toBe('SPOTIFY');
  });

  it('takes bio from Last.fm', () => {
    const result = mergeSourceData(SPOTIFY, LASTFM, MUSICBRAINZ);

    expect(result.bio).toBe('Skrillex is an American DJ and record producer.');
    expect(result.fieldProvenance.bio).toBe('LASTFM');
  });

  it('takes musicbrainzId from MusicBrainz over Last.fm mbid', () => {
    const result = mergeSourceData(SPOTIFY, LASTFM, MUSICBRAINZ);

    expect(result.musicbrainzId).toBe('mb-456');
    expect(result.fieldProvenance.musicbrainzId).toBe('MUSICBRAINZ');
  });

  it('falls back to Last.fm mbid when no MusicBrainz data', () => {
    const result = mergeSourceData(SPOTIFY, LASTFM, null);

    expect(result.musicbrainzId).toBe('mb-456');
    expect(result.fieldProvenance.musicbrainzId).toBe('LASTFM');
  });

  it('collects externalTags from both Spotify and Last.fm', () => {
    const result = mergeSourceData(SPOTIFY, LASTFM, null);

    expect(result.externalTags).toContain('dubstep');
    expect(result.externalTags).toContain('edm');
    expect(result.externalTags).toContain('electronic');
    expect(result.externalTags).toContain('bass music');
  });

  it('handles Spotify-only data', () => {
    const result = mergeSourceData(SPOTIFY, null, null);

    expect(result.name).toBe('Skrillex');
    expect(result.bio).toBeNull();
    expect(result.primarySource).toBe('SPOTIFY');
    expect(result.confidence).toBe('TRUSTED_SOURCE');
    expect(result.spotifyId).toBe('sp-123');
    expect(result.lastfmId).toBeNull();
    expect(result.musicbrainzId).toBeNull();
  });

  it('handles Last.fm-only data', () => {
    const result = mergeSourceData(null, LASTFM, null);

    expect(result.name).toBe('Skrillex');
    expect(result.imageUrl).toBeNull();
    expect(result.primarySource).toBe('LASTFM');
    expect(result.confidence).toBe('UNVERIFIED');
    expect(result.bio).toBe('Skrillex is an American DJ and record producer.');
    expect(result.lastfmId).toBe('Skrillex');
  });

  it('handles MusicBrainz-only data', () => {
    const result = mergeSourceData(null, null, MUSICBRAINZ);

    expect(result.name).toBe('Skrillex');
    expect(result.primarySource).toBe('MUSICBRAINZ');
    expect(result.confidence).toBe('UNVERIFIED');
    expect(result.musicbrainzId).toBe('mb-456');
  });

  it('produces empty result when no sources', () => {
    const result = mergeSourceData(null, null, null);

    expect(result.name).toBe('');
    expect(result.primarySource).toBe('ADMIN');
    expect(result.confidence).toBe('UNVERIFIED');
    expect(result.externalTags).toEqual([]);
  });

  it('sets spotifyUrl from Spotify', () => {
    const result = mergeSourceData(SPOTIFY, null, null);

    expect(result.spotifyUrl).toBe('https://open.spotify.com/artist/sp-123');
    expect(result.fieldProvenance.spotifyUrl).toBe('SPOTIFY');
  });

  it('records lastfmId as the artist name', () => {
    const result = mergeSourceData(null, LASTFM, null);

    expect(result.lastfmId).toBe('Skrillex');
    expect(result.fieldProvenance.lastfmId).toBe('LASTFM');
  });
});
