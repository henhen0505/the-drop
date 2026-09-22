import { describe, expect, it } from 'vitest';
import { normalize } from '../../../src/dedup/normalizer';

describe('normalize — title (architecture/dedup-engine.md Step 1)', () => {
  it('reduces "Knock2 Live at Brooklyn Mirage" to the headliner', () => {
    expect(
      normalize('Knock2 Live at Brooklyn Mirage', 'title', { venueName: 'Brooklyn Mirage' }),
    ).toBe('knock2');
  });

  it('strips the venue even when the venue name carries a leading "The"', () => {
    expect(
      normalize('Knock2 Live at Brooklyn Mirage', 'title', { venueName: 'The Brooklyn Mirage' }),
    ).toBe('knock2');
  });

  it('handles the SeatGeek-style title from the spec table', () => {
    expect(
      normalize('KNOCK2 -- The Brooklyn Mirage -- NYC', 'title', {
        venueName: 'The Brooklyn Mirage',
      }),
    ).toBe('knock2 nyc');
  });

  it('strips filler phrases and punctuation', () => {
    expect(normalize('Fisher presents Catch & Release Tour', 'title')).toBe('fisher catch release');
    expect(normalize('Skrillex feat. Fred again..', 'title')).toBe('skrillex fred again');
    expect(normalize('Official Concert @ The Warehouse', 'title')).toBe('warehouse');
  });

  it('works without a venue name', () => {
    expect(normalize('  Halloween   Rave  ', 'title')).toBe('halloween rave');
  });
});

describe('normalize — venue', () => {
  it('drops a leading "the"', () => {
    expect(normalize('The Brooklyn Mirage', 'venue')).toBe('brooklyn mirage');
  });

  it('drops common suffix words', () => {
    expect(normalize('Webster Hall', 'venue')).toBe('webster');
    expect(normalize('The Bowery Ballroom', 'venue')).toBe('bowery');
    expect(normalize('Radio City Music Hall', 'venue')).toBe('radio city music');
  });

  it('keeps a name that is only a suffix word', () => {
    expect(normalize('Hall', 'venue')).toBe('hall');
  });

  it('keeps digits and strips punctuation', () => {
    expect(normalize('Terminal 5', 'venue')).toBe('terminal 5');
    expect(normalize("Avant Gardner's", 'venue')).toBe('avant gardners');
  });
});

describe('normalize — artist', () => {
  it('strips a leading "dj " prefix', () => {
    expect(normalize('DJ Snake', 'artist')).toBe('snake');
  });

  it('keeps the name when it is only "dj" or has no space after dj', () => {
    expect(normalize('DJ', 'artist')).toBe('dj');
    expect(normalize('Djwhatever', 'artist')).toBe('djwhatever');
  });

  it('lowercases and strips punctuation', () => {
    expect(normalize('REZZ', 'artist')).toBe('rezz');
    expect(normalize('Rezz.', 'artist')).toBe('rezz');
    expect(normalize('Fred again..', 'artist')).toBe('fred again');
  });
});
