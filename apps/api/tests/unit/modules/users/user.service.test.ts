import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

import { db } from '../../../../src/db/client';
import { users } from '../../../../src/db/schema/users';
import { updateProfile } from '../../../../src/modules/users/user.service';
import { NotFoundError } from '../../../../src/utils/errors';
import { createFakeTx, stepArg, updatesOf, type RecordedOp } from '../../../helpers/fake-db';

const USER_ID = '11111111-1111-4111-8111-111111111111';

let ops: RecordedOp[] = [];

function useFakeDb(results: unknown[]): void {
  const fake = createFakeTx(results);
  ops = fake.ops;
  const target = fake.tx as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const method of ['select', 'update'] as const) {
    vi.mocked(db[method]).mockImplementation(((...args: unknown[]) => target[method]?.(...args)) as never);
  }
}

function userRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USER_ID,
    email: 'raver@example.com',
    displayName: 'Raver',
    avatarUrl: null,
    role: 'USER',
    preferredCity: null,
    preferredState: null,
    preferredLatitude: null,
    preferredLongitude: null,
    travelRadiusKm: 80,
    priceMinCents: null,
    priceMaxCents: null,
    emailVerified: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function updatedColumns(): Record<string, unknown> {
  const [update] = updatesOf(ops, users);
  return stepArg(update!, 'set') as Record<string, unknown>;
}

describe('updateProfile coordinate resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a known city and state into both coordinate columns', async () => {
    useFakeDb([[{ preferredCity: null, preferredState: null }], [userRow()]]);

    await updateProfile(USER_ID, { preferredCity: 'Brooklyn', preferredState: 'NY' });

    expect(updatedColumns()).toMatchObject({
      preferredCity: 'Brooklyn',
      preferredState: 'NY',
      preferredLatitude: 40.6782,
      preferredLongitude: -73.9442,
    });
  });

  it('matches regardless of case', async () => {
    useFakeDb([[{ preferredCity: null, preferredState: null }], [userRow()]]);

    await updateProfile(USER_ID, { preferredCity: 'las vegas', preferredState: 'nv' });

    expect(updatedColumns()).toMatchObject({ preferredLatitude: 36.1699, preferredLongitude: -115.1398 });
  });

  it('sets both columns to null (not skipped, not an error) when the city is not in the dataset', async () => {
    useFakeDb([[{ preferredCity: 'Denver', preferredState: 'CO' }], [userRow()]]);

    await updateProfile(USER_ID, { preferredCity: 'Atlantis', preferredState: 'NY' });

    const columns = updatedColumns();
    expect(columns).toHaveProperty('preferredLatitude', null);
    expect(columns).toHaveProperty('preferredLongitude', null);
    // The unresolved city is still saved as the user's stated preference.
    expect(columns.preferredCity).toBe('Atlantis');
  });

  it('uses the stored state when only the city is updated', async () => {
    useFakeDb([[{ preferredCity: 'Old Town', preferredState: 'CO' }], [userRow()]]);

    await updateProfile(USER_ID, { preferredCity: 'Denver' });

    expect(updatedColumns()).toMatchObject({ preferredLatitude: 39.7392, preferredLongitude: -104.9903 });
  });

  it('uses the stored city when only the state is updated', async () => {
    useFakeDb([[{ preferredCity: 'Denver', preferredState: 'NY' }], [userRow()]]);

    await updateProfile(USER_ID, { preferredState: 'CO' });

    expect(updatedColumns()).toMatchObject({ preferredLatitude: 39.7392, preferredLongitude: -104.9903 });
  });

  it('clears stale coordinates when the city becomes unresolvable because the state changed', async () => {
    useFakeDb([[{ preferredCity: 'Denver', preferredState: 'CO' }], [userRow()]]);

    await updateProfile(USER_ID, { preferredState: 'NY' });

    const columns = updatedColumns();
    expect(columns).toHaveProperty('preferredLatitude', null);
    expect(columns).toHaveProperty('preferredLongitude', null);
  });

  it('clears the coordinates when the city is removed', async () => {
    useFakeDb([[{ preferredCity: 'Denver', preferredState: 'CO' }], [userRow()]]);

    await updateProfile(USER_ID, { preferredCity: null });

    const columns = updatedColumns();
    expect(columns.preferredCity).toBeNull();
    expect(columns).toHaveProperty('preferredLatitude', null);
    expect(columns).toHaveProperty('preferredLongitude', null);
  });

  it('leaves the coordinates alone, and never reads the stored location, for an unrelated update', async () => {
    useFakeDb([[userRow({ displayName: 'New Name' })]]);

    await updateProfile(USER_ID, { displayName: 'New Name' });

    const columns = updatedColumns();
    expect(columns).not.toHaveProperty('preferredLatitude');
    expect(columns).not.toHaveProperty('preferredLongitude');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('404s without updating when the user does not exist', async () => {
    useFakeDb([[]]);

    await expect(updateProfile(USER_ID, { preferredCity: 'Denver', preferredState: 'CO' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it('does not expose the coordinates in the returned profile', async () => {
    useFakeDb([
      [{ preferredCity: null, preferredState: null }],
      [userRow({ preferredCity: 'Brooklyn', preferredState: 'NY', preferredLatitude: 40.6782, preferredLongitude: -73.9442 })],
    ]);

    const profile = await updateProfile(USER_ID, { preferredCity: 'Brooklyn', preferredState: 'NY' });

    expect(profile).not.toHaveProperty('preferredLatitude');
    expect(profile).not.toHaveProperty('preferredLongitude');
    expect(profile.preferredCity).toBe('Brooklyn');
  });
});
