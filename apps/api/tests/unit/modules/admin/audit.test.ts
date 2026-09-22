import { describe, expect, it } from 'vitest';
import { adminAuditLog } from '../../../../src/db/schema/admin';
import { logAdminAction } from '../../../../src/modules/admin/audit';
import { createFakeTx, insertsInto, stepArg } from '../../../helpers/fake-db';

describe('logAdminAction', () => {
  it('inserts one audit row with the actor, action, target and details', async () => {
    const { tx, ops } = createFakeTx();

    await logAdminAction(tx, {
      adminId: 'admin-1',
      action: 'update_event',
      targetType: 'event',
      targetId: 'evt-1',
      details: { changes: { title: { from: 'a', to: 'b' } } },
    });

    const inserts = insertsInto(ops, adminAuditLog);
    expect(inserts).toHaveLength(1);
    expect(stepArg(inserts[0]!, 'values')).toEqual({
      adminId: 'admin-1',
      action: 'update_event',
      targetType: 'event',
      targetId: 'evt-1',
      details: { changes: { title: { from: 'a', to: 'b' } } },
    });
  });

  it('stores null details when there are none', async () => {
    const { tx, ops } = createFakeTx();

    await logAdminAction(tx, { adminId: 'admin-1', action: 'x', targetType: 'event', targetId: 'evt-1' });

    expect(stepArg(insertsInto(ops, adminAuditLog)[0]!, 'values')).toMatchObject({ details: null });
  });

  it('writes through the transaction it is given, not the global connection', async () => {
    const { tx, ops } = createFakeTx();

    await logAdminAction(tx, { adminId: 'a', action: 'x', targetType: 't', targetId: 'id' });

    expect(ops).toHaveLength(1);
    expect(ops[0]?.root).toBe('insert');
  });
});
