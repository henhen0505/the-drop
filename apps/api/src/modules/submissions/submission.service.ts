import { and, count, desc, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { SubmissionStatus, UserRole } from '@the-drop/types';
import { config } from '../../config/index';
import { db } from '../../db/client';
import { communitySubmissions } from '../../db/schema/submissions';
import { venues } from '../../db/schema/venues';
import type { DbTx } from '../../dedup/types';
import { ConflictError, ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { decodeTimestampIdCursor, encodeCursor, parseLimit } from '../../utils/pagination';
import { convertSubmission } from './submission-conversion';
import { toSubmissionView, type SubmissionRow, type SubmissionView } from './submission-view';
import type { CreateSubmissionInput } from './submission.validation';

// Not in any spec: a cheap guard so one account can't flood the admin review queue.
export const MAX_PENDING_SUBMISSIONS_PER_USER = 10;

export const AUTO_PUBLISH_NOTE = 'Auto-published: promoter vetting period complete';

export interface CreateSubmissionResult {
  id: string;
  status: SubmissionStatus;
  createdAt: Date;
}

export interface MySubmissionsOptions {
  status?: SubmissionStatus;
  cursor?: string;
  limit?: number;
}

export interface MySubmissionsResult {
  data: SubmissionView[];
  cursor: string | null;
}

/** A promoter is vetted once enough of their submissions were approved or merged by an actual admin. */
async function isVettedPromoter(tx: DbTx, userId: string): Promise<boolean> {
  const threshold = config.submissions.promoterAutoPublishAfter;
  if (threshold === 0) return true;

  const [row] = await tx
    .select({ reviewed: count() })
    .from(communitySubmissions)
    .where(
      and(
        eq(communitySubmissions.submitterId, userId),
        inArray(communitySubmissions.status, ['APPROVED', 'MERGED']),
        isNotNull(communitySubmissions.reviewedBy),
      ),
    );
  return (row?.reviewed ?? 0) >= threshold;
}

/**
 * Publishes inside a savepoint so a conversion failure rolls back only the attempt: the
 * submission stays PENDING for an admin instead of the promoter's whole request failing.
 */
async function tryAutoPublish(tx: DbTx, submission: SubmissionRow): Promise<boolean> {
  try {
    await tx.transaction(async (savepoint) => {
      await convertSubmission(savepoint, submission);
      await savepoint
        .update(communitySubmissions)
        .set({ status: 'APPROVED', reviewedAt: new Date(), reviewNotes: AUTO_PUBLISH_NOTE })
        .where(eq(communitySubmissions.id, submission.id));
    });
    return true;
  } catch (err) {
    logger.error({ err, submissionId: submission.id }, 'submission: auto-publish failed, left PENDING');
    return false;
  }
}

export async function createSubmission(
  user: { id: string; role: UserRole },
  input: CreateSubmissionInput,
): Promise<CreateSubmissionResult> {
  return db.transaction(async (tx) => {
    if (input.venueId) {
      const [venue] = await tx
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.id, input.venueId))
        .limit(1);
      if (!venue) {
        throw new ValidationError('Venue not found', { field: 'venueId' });
      }
    }

    const [pending] = await tx
      .select({ total: count() })
      .from(communitySubmissions)
      .where(and(eq(communitySubmissions.submitterId, user.id), eq(communitySubmissions.status, 'PENDING')));
    if ((pending?.total ?? 0) >= MAX_PENDING_SUBMISSIONS_PER_USER) {
      throw new ConflictError('You have too many submissions awaiting review. Please wait for some to be reviewed.');
    }

    const [row] = await tx
      .insert(communitySubmissions)
      .values({
        submitterId: user.id,
        eventTitle: input.eventTitle,
        eventStartsAt: input.eventStartsAt,
        venueId: input.venueId ?? null,
        venueNameRaw: input.venueNameRaw ?? null,
        venueAddressRaw: input.venueAddressRaw ?? null,
        artistNames: input.artistNames,
        description: input.description ?? null,
        posterImageUrl: input.posterImageUrl ?? null,
        ticketUrl: input.ticketUrl ?? null,
        sourceUrl: input.sourceUrl ?? null,
        ageRestriction: input.ageRestriction ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('Failed to create submission');
    }

    if (user.role === 'PROMOTER' && (await isVettedPromoter(tx, user.id))) {
      if (await tryAutoPublish(tx, row)) {
        return { id: row.id, status: 'APPROVED', createdAt: row.createdAt };
      }
    }

    return { id: row.id, status: row.status, createdAt: row.createdAt };
  });
}

export async function listMySubmissions(
  userId: string,
  opts: MySubmissionsOptions,
): Promise<MySubmissionsResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeTimestampIdCursor(opts.cursor, 'createdAt') : undefined;

  const conditions: SQL[] = [eq(communitySubmissions.submitterId, userId)];
  if (opts.status) {
    conditions.push(eq(communitySubmissions.status, opts.status));
  }
  if (cursorData) {
    conditions.push(
      sql`(${communitySubmissions.createdAt}, ${communitySubmissions.id}) < (${cursorData.at}::timestamptz, ${cursorData.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(communitySubmissions)
    .where(and(...conditions))
    .orderBy(desc(communitySubmissions.createdAt), desc(communitySubmissions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const cursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null;

  return { data: page.map(toSubmissionView), cursor };
}
