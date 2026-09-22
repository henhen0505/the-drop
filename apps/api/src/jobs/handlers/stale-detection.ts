import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { events } from '../../db/schema/events';
import { logger } from '../../utils/logger';
import type { JobMessage } from '../poller';

export async function handleStaleDetection(_message: JobMessage): Promise<void> {
  const flagged = await db
    .update(events)
    .set({ staleFlaggedAt: sql`now()` })
    .where(
      and(
        eq(events.status, 'PUBLISHED'),
        or(
          isNull(events.lastVerifiedAt),
          sql`${events.lastVerifiedAt} < now() - interval '14 days'`,
        ),
        isNull(events.staleFlaggedAt),
      ),
    )
    .returning({ id: events.id });

  const unflagged = await db
    .update(events)
    .set({ staleFlaggedAt: null })
    .where(
      and(
        isNotNull(events.staleFlaggedAt),
        isNotNull(events.lastVerifiedAt),
        sql`${events.lastVerifiedAt} >= now() - interval '14 days'`,
      ),
    )
    .returning({ id: events.id });

  logger.info(
    { flagged: flagged.length, unflagged: unflagged.length },
    'Stale detection job complete',
  );
}
