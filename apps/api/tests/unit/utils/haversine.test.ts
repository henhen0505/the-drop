import { describe, expect, it } from 'vitest';
import { haversineKm } from '../../../src/utils/haversine';

describe('haversineKm', () => {
  it('is 0 for identical points', () => {
    expect(haversineKm(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
  });

  it('is one degree of arc (2*pi*6371/360 = 111.195 km) along the equator', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.195, 2);
  });

  it('is half the Earth circumference (pi * 6371 = 20015.09 km) between antipodes', () => {
    expect(haversineKm(0, 0, 0, 180)).toBeCloseTo(20015.09, 1);
  });

  it('puts New York to Los Angeles at roughly 3,940 km', () => {
    const km = haversineKm(40.7128, -74.006, 34.0522, -118.2437);
    expect(km).toBeGreaterThan(3900);
    expect(km).toBeLessThan(3980);
  });

  it('puts Brooklyn to Manhattan at under 20 km', () => {
    const km = haversineKm(40.6782, -73.9442, 40.7831, -73.9712);
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(20);
  });

  it('is symmetric', () => {
    const forward = haversineKm(39.7392, -104.9903, 36.1699, -115.1398);
    const backward = haversineKm(36.1699, -115.1398, 39.7392, -104.9903);
    expect(forward).toBeCloseTo(backward, 10);
  });

  it('shrinks a degree of longitude with latitude (the reason a flat lat/lon box is wrong)', () => {
    const atEquator = haversineKm(0, 0, 0, 1);
    const atSixty = haversineKm(60, 0, 60, 1);
    expect(atSixty).toBeCloseTo(atEquator / 2, 0);
  });
});
