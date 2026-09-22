import { describe, expect, it } from 'vitest';
import {
  ingestBySpotifyIdSchema,
  searchAndIngestSchema,
} from '../../../../src/modules/artists/ingestion.validation';

describe('ingestBySpotifyIdSchema', () => {
  it('accepts a non-empty spotifyId', () => {
    expect(ingestBySpotifyIdSchema.params.safeParse({ spotifyId: 'abc123' }).success).toBe(true);
  });

  it('rejects an empty spotifyId', () => {
    expect(ingestBySpotifyIdSchema.params.safeParse({ spotifyId: '' }).success).toBe(false);
  });
});

describe('searchAndIngestSchema', () => {
  it('accepts a valid query', () => {
    expect(searchAndIngestSchema.body.safeParse({ query: 'skrillex' }).success).toBe(true);
  });

  it('rejects an empty query', () => {
    expect(searchAndIngestSchema.body.safeParse({ query: '' }).success).toBe(false);
  });

  it('rejects a missing query', () => {
    expect(searchAndIngestSchema.body.safeParse({}).success).toBe(false);
  });

  it('rejects a query longer than 200 characters', () => {
    expect(searchAndIngestSchema.body.safeParse({ query: 'a'.repeat(201) }).success).toBe(false);
  });

  it('accepts a 200-character query', () => {
    expect(searchAndIngestSchema.body.safeParse({ query: 'a'.repeat(200) }).success).toBe(true);
  });
});
