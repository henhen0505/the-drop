import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/db/client', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
    transaction: vi.fn(),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  },
}));

import { matchGenres, clearGenreCache } from '../../../../src/modules/artists/genre-linker';
import { db } from '../../../../src/db/client';

const MOCK_GENRES = [
  { id: 'g1', name: 'House', slug: 'house' },
  { id: 'g2', name: 'Deep House', slug: 'deep-house' },
  { id: 'g3', name: 'Techno', slug: 'techno' },
  { id: 'g4', name: 'Dubstep', slug: 'dubstep' },
  { id: 'g5', name: 'Drum and Bass', slug: 'drum-and-bass' },
  { id: 'g6', name: 'Trance', slug: 'trance' },
  { id: 'g7', name: 'Melodic Techno', slug: 'melodic-techno' },
  { id: 'g8', name: 'Progressive House', slug: 'progressive-house' },
];

describe('genre-linker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGenreCache();
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(MOCK_GENRES),
    } as never);
  });

  describe('matchGenres', () => {
    it('returns empty array for empty tags', async () => {
      expect(await matchGenres([])).toEqual([]);
    });

    it('matches exact slug', async () => {
      const result = await matchGenres(['house']);
      expect(result).toContain('g1');
    });

    it('matches case-insensitive name', async () => {
      const result = await matchGenres(['HOUSE']);
      expect(result).toContain('g1');
    });

    it('matches multiple genres', async () => {
      const result = await matchGenres(['house', 'techno', 'dubstep']);
      expect(result).toHaveLength(3);
      expect(result).toContain('g1');
      expect(result).toContain('g3');
      expect(result).toContain('g4');
    });

    it('deduplicates matches', async () => {
      const result = await matchGenres(['house', 'House', 'HOUSE']);
      expect(result).toHaveLength(1);
      expect(result).toContain('g1');
    });

    it('matches compound genre names', async () => {
      const result = await matchGenres(['deep house']);
      expect(result).toContain('g2');
    });

    it('matches via partial slug containment', async () => {
      const result = await matchGenres(['deep house music']);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result).toContain('g2');
    });

    it('skips unrecognized tags', async () => {
      const result = await matchGenres(['screamo', 'house']);
      expect(result).toHaveLength(1);
      expect(result).toContain('g1');
    });

    it('caches genre list across calls', async () => {
      await matchGenres(['house']);
      await matchGenres(['techno']);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('reloads genres after cache clear', async () => {
      await matchGenres(['house']);
      clearGenreCache();
      await matchGenres(['techno']);
      expect(db.select).toHaveBeenCalledTimes(2);
    });
  });
});
