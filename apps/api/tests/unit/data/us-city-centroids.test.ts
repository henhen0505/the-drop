import { describe, expect, it } from 'vitest';
import { US_CITY_CENTROIDS, lookupCityCoordinates } from '../../../src/data/us-city-centroids';

const TICKETMASTER_TARGET_STATES = ['NY', 'CA', 'NV', 'CO', 'FL', 'IL', 'TX', 'PA', 'MA', 'AZ'];

describe('lookupCityCoordinates', () => {
  it('resolves a known city and state', () => {
    expect(lookupCityCoordinates('Brooklyn', 'NY')).toEqual({ latitude: 40.6782, longitude: -73.9442 });
  });

  it('matches case-insensitively on both city and state', () => {
    expect(lookupCityCoordinates('las vegas', 'nv')).toEqual(lookupCityCoordinates('Las Vegas', 'NV'));
    expect(lookupCityCoordinates('DENVER', 'co')).not.toBeNull();
  });

  it('returns null for a city that is not in the dataset', () => {
    expect(lookupCityCoordinates('Atlantis', 'NY')).toBeNull();
  });

  it('does not match the right city in the wrong state', () => {
    expect(lookupCityCoordinates('Denver', 'NY')).toBeNull();
  });

  it('does not do partial matching', () => {
    expect(lookupCityCoordinates('Brook', 'NY')).toBeNull();
  });

  it('returns only the coordinates, not the whole record', () => {
    expect(Object.keys(lookupCityCoordinates('Denver', 'CO') ?? {}).sort()).toEqual([
      'latitude',
      'longitude',
    ]);
  });
});

describe('US_CITY_CENTROIDS dataset', () => {
  it('covers every Ticketmaster sync target state', () => {
    const states = new Set(US_CITY_CENTROIDS.map((entry) => entry.state));
    for (const state of TICKETMASTER_TARGET_STATES) {
      expect(states.has(state), `missing state ${state}`).toBe(true);
    }
  });

  it('has no duplicate city and state pairs (the lookup index would silently keep only the last)', () => {
    const keys = US_CITY_CENTROIDS.map((entry) => `${entry.city}|${entry.state}`.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses two-letter uppercase state codes', () => {
    for (const entry of US_CITY_CENTROIDS) {
      expect(entry.state, entry.city).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('keeps every coordinate inside a plausible US bounding box', () => {
    for (const entry of US_CITY_CENTROIDS) {
      expect(entry.latitude, entry.city).toBeGreaterThan(17);
      expect(entry.latitude, entry.city).toBeLessThan(72);
      expect(entry.longitude, entry.city).toBeGreaterThan(-180);
      expect(entry.longitude, entry.city).toBeLessThan(-64);
    }
  });
});
