import { describe, expect, it } from 'vitest';
import {
  updateProfileSchema,
  setGenrePreferencesSchema,
  updateNotificationPrefsSchema,
} from '../../../../src/modules/users/user.validation';

describe('updateProfileSchema', () => {
  it('accepts valid partial update', () => {
    expect(updateProfileSchema.body.safeParse({ displayName: 'New Name' }).success).toBe(true);
  });

  it('accepts empty object (no-op update)', () => {
    expect(updateProfileSchema.body.safeParse({}).success).toBe(true);
  });

  it('rejects an empty displayName', () => {
    expect(updateProfileSchema.body.safeParse({ displayName: '' }).success).toBe(false);
  });

  it('rejects a displayName longer than 100 characters', () => {
    expect(
      updateProfileSchema.body.safeParse({ displayName: 'a'.repeat(101) }).success,
    ).toBe(false);
  });

  it('rejects travelRadiusKm > 500', () => {
    expect(updateProfileSchema.body.safeParse({ travelRadiusKm: 501 }).success).toBe(false);
  });

  it('rejects travelRadiusKm < 1', () => {
    expect(updateProfileSchema.body.safeParse({ travelRadiusKm: 0 }).success).toBe(false);
  });

  it('rejects a non-integer travelRadiusKm', () => {
    expect(updateProfileSchema.body.safeParse({ travelRadiusKm: 12.5 }).success).toBe(false);
  });

  it('rejects priceMin > priceMax', () => {
    expect(updateProfileSchema.body.safeParse({ priceMin: 5000, priceMax: 2000 }).success).toBe(
      false,
    );
  });

  it('accepts priceMin == priceMax', () => {
    expect(updateProfileSchema.body.safeParse({ priceMin: 5000, priceMax: 5000 }).success).toBe(
      true,
    );
  });

  it('accepts priceMin without priceMax', () => {
    expect(updateProfileSchema.body.safeParse({ priceMin: 5000 }).success).toBe(true);
  });

  it('rejects a negative priceMin', () => {
    expect(updateProfileSchema.body.safeParse({ priceMin: -1 }).success).toBe(false);
  });

  it('accepts null for nullable fields', () => {
    expect(
      updateProfileSchema.body.safeParse({ avatarUrl: null, preferredCity: null }).success,
    ).toBe(true);
  });

  it('rejects an invalid avatarUrl', () => {
    expect(updateProfileSchema.body.safeParse({ avatarUrl: 'not-a-url' }).success).toBe(false);
  });

  it('accepts an https avatarUrl but rejects script and data URLs that would run when rendered', () => {
    expect(updateProfileSchema.body.safeParse({ avatarUrl: 'https://example.com/me.png' }).success).toBe(true);
    expect(updateProfileSchema.body.safeParse({ avatarUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(updateProfileSchema.body.safeParse({ avatarUrl: 'data:text/html,<script>1</script>' }).success).toBe(false);
  });

  it('rejects a preferredState longer than 2 characters', () => {
    expect(updateProfileSchema.body.safeParse({ preferredState: 'NYC' }).success).toBe(false);
  });
});

describe('setGenrePreferencesSchema', () => {
  it('accepts array of valid UUIDs', () => {
    expect(
      setGenrePreferencesSchema.body.safeParse({
        genreIds: ['550e8400-e29b-41d4-a716-446655440000'],
      }).success,
    ).toBe(true);
  });

  it('accepts empty array (clear all)', () => {
    expect(setGenrePreferencesSchema.body.safeParse({ genreIds: [] }).success).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(setGenrePreferencesSchema.body.safeParse({ genreIds: ['not-a-uuid'] }).success).toBe(
      false,
    );
  });

  it('rejects more than 20 genres', () => {
    const ids = Array.from(
      { length: 21 },
      (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
    );
    expect(setGenrePreferencesSchema.body.safeParse({ genreIds: ids }).success).toBe(false);
  });

  it('accepts exactly 20 genres', () => {
    const ids = Array.from(
      { length: 20 },
      (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
    );
    expect(setGenrePreferencesSchema.body.safeParse({ genreIds: ids }).success).toBe(true);
  });

  it('rejects a missing genreIds field', () => {
    expect(setGenrePreferencesSchema.body.safeParse({}).success).toBe(false);
  });
});

describe('updateNotificationPrefsSchema', () => {
  it('accepts partial boolean updates', () => {
    expect(updateNotificationPrefsSchema.body.safeParse({ eventTomorrow: false }).success).toBe(
      true,
    );
  });

  it('accepts empty object', () => {
    expect(updateNotificationPrefsSchema.body.safeParse({}).success).toBe(true);
  });

  it('accepts all fields set', () => {
    expect(
      updateNotificationPrefsSchema.body.safeParse({
        eventTomorrow: true,
        eventCancelled: false,
        eventRescheduled: true,
        artistNewEvent: false,
        submissionUpdates: true,
      }).success,
    ).toBe(true);
  });

  it('rejects non-boolean values', () => {
    expect(updateNotificationPrefsSchema.body.safeParse({ eventTomorrow: 'yes' }).success).toBe(
      false,
    );
  });
});
