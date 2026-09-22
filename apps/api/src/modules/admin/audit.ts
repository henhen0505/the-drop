import { adminAuditLog } from '../../db/schema/admin';
import type { DbTx } from '../../dedup/types';

export interface AdminAuditEntry {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}

/** Written inside the same transaction as the action it records, so the two commit or roll back together. */
export async function logAdminAction(tx: DbTx, entry: AdminAuditEntry): Promise<void> {
  await tx.insert(adminAuditLog).values({
    adminId: entry.adminId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: entry.details ?? null,
  });
}
