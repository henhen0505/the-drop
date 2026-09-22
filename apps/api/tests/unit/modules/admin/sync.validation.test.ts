import { describe, expect, it } from 'vitest';
import { triggerSyncSchema } from '../../../../src/modules/admin/sync.validation';

describe('triggerSyncSchema.body', () => {
  it('accepts sourceType TICKETMASTER', () => {
    expect(triggerSyncSchema.body.safeParse({ sourceType: 'TICKETMASTER' }).success).toBe(true);
  });

  it('rejects any other sourceType, including SEATGEEK', () => {
    expect(triggerSyncSchema.body.safeParse({ sourceType: 'SEATGEEK' }).success).toBe(false);
    expect(triggerSyncSchema.body.safeParse({}).success).toBe(false);
  });
});
