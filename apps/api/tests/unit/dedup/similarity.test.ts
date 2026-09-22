import { describe, expect, it } from 'vitest';
import { trigramSimilarity, trigrams } from '../../../src/dedup/similarity';

describe('trigrams', () => {
  it('pads each word with two leading and one trailing space (pg_trgm)', () => {
    expect([...trigrams('word')].sort()).toEqual(['  w', ' wo', 'ord', 'rd ', 'wor'].sort());
  });

  it('ignores case and punctuation between words', () => {
    expect(trigrams('Rl-Grime')).toEqual(trigrams('rl grime'));
  });

  it('returns an empty set for text without letters or digits', () => {
    expect(trigrams('---').size).toBe(0);
  });
});

describe('trigramSimilarity', () => {
  it("matches the value documented for pg_trgm: similarity('word', 'two words') = 4/11", () => {
    expect(trigramSimilarity('word', 'two words')).toBeCloseTo(4 / 11, 6);
  });

  it('is 1 for identical text regardless of case', () => {
    expect(trigramSimilarity('Brooklyn Mirage', 'brooklyn mirage')).toBe(1);
  });

  it('is 0 when nothing is shared', () => {
    expect(trigramSimilarity('abc', 'xyz')).toBe(0);
  });

  it('is 0 when either side is empty', () => {
    expect(trigramSimilarity('', 'abc')).toBe(0);
    expect(trigramSimilarity('abc', '')).toBe(0);
    expect(trigramSimilarity('', '')).toBe(0);
  });

  it('is symmetric', () => {
    expect(trigramSimilarity('knock2', 'knock2 nyc')).toBe(trigramSimilarity('knock2 nyc', 'knock2'));
  });
});
