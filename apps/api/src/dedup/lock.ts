import { sql } from 'drizzle-orm';
import type { DbTx } from './types';

// Arbitrary constant; all dedup writers (pipeline and admin resolution) serialize on it.
const DEDUP_LOCK_KEY = 7_331_001;

/**
 * Serializes dedup work so two listings of the same real-world event can't both miss each
 * other and create duplicate canonical events. Released automatically at transaction end.
 */
export async function acquireDedupLock(tx: DbTx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${DEDUP_LOCK_KEY})`);
}
