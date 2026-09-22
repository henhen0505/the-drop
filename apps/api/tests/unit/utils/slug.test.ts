import { describe, expect, it } from 'vitest';
import { slugify, slugifyWithSuffix } from '../../../src/utils/slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Knock2 at Brooklyn Mirage!')).toBe('knock2-at-brooklyn-mirage');
  });

  it('strips diacritics', () => {
    expect(slugify('Café del Mar')).toBe('cafe-del-mar');
  });

  it('collapses repeated separators and trims edges', () => {
    expect(slugify('  --Multiple   Spaces--  ')).toBe('multiple-spaces');
  });

  it('throws on input with no alphanumeric characters', () => {
    expect(() => slugify('!!!')).toThrow();
  });
});

describe('slugifyWithSuffix', () => {
  it('appends a random suffix to the base slug', () => {
    const result = slugifyWithSuffix('The Warehouse');
    expect(result).toMatch(/^the-warehouse-[a-z0-9]{6}$/);
  });
});
