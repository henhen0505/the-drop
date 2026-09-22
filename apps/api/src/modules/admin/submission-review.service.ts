import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import type { SubmissionStatus, UserRole } from '@the-drop/types';
import { db } from '../../db/client';
import { events } from '../../db/schema/events';
import { communitySubmissions } from '../../db/schema/submissions';
import { users } from '../../db/schema/users';
import { venues } from '../../db/schema/venues';
import { acquireDedupLock } from '../../dedup/lock';
import type { MatchDecision } from '../../dedup/types';
import { ConflictError, NotFoundError } from '../../utils/errors';
import { decodeTimestampIdCursor, encodeCursor, parseLimit } from '../../utils/pagination';
import {
  convertSubmission,
  mergeSubmissionIntoEvent,
} from '../submissions/submission-conversion';
import { toSubmissionView, type SubmissionView } from '../submissions/submission-view';
import { logAdminAction } from './audit';
import type { ReviewSubmissionInput } from './submission-review.validation';

export interface AdminSubmissionView extends SubmissionView {
  submitter: { id: string; displayName: string; role: UserRole };
  venue: { id: string; name: string; city: string; state: string | null } | null;
}

export interface ListSubmissionsOptions {
  status?: SubmissionStatus;
  cursor?: string;
  limit?: number;
}

export interface ListSubmissionsResult {
  data: AdminSubmissionView[];
  cursor: string | null;
}

export interface ReviewedSubmission extends SubmissionView {
  /** The event this submission ended up as (null when rejected, or queued for dedup review). */
  resultEventId: string | null;
  /** What the dedup pipeline decided when the submission was approved (null for reject/merge). */
  dedupDecision: MatchDecision | null;
}

/** Oldest first: this is a review queue, so the longest-waiting submission comes up first. */
export async function listSubmissions(opts: ListSubmissionsOptions): Promise<ListSubmissionsResult> {
  const limit = parseLimit(opts.limit);
  const cursorData = opts.cursor ? decodeTimestampIdCursor(opts.cursor, 'createdAt') : undefined;

  const conditions: SQL[] = [eq(communitySubmissions.status, opts.status ?? 'PENDING')];
  if (cursorData) {
    conditions.push(
      sql`(${communitySubmissions.createdAt}, ${communitySubmissions.id}) > (${cursorData.at}::timestamptz, ${cursorData.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      submission: communitySubmissions,
      submitterId: users.id,
      submitterName: users.displayName,
      submitterRole: users.role,
      venueId: venues.id,
      venueName: venues.name,
      venueCity: venues.city,
      venueState: venues.state,
    })
    .from(communitySubmissions)
    .innerJoin(users, eq(users.id, communitySubmissions.submitterId))
    .leftJoin(venues, eq(venues.id, communitySubmissions.venueId))
    .where(and(...conditions))
    .orderBy(asc(communitySubmissions.createdAt), asc(communitySubmissions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const data: AdminSubmissionView[] = page.map((row) => ({
    ...toSubmissionView(row.submission),
    submitter: { id: row.submitterId, displayName: row.submitterName, role: row.submitterRole },
    venue: row.venueId
      ? { id: row.venueId, name: row.venueName!, city: row.venueCity!, state: row.venueState }
      : null,
  }));

  const last = page[page.length - 1];
  const cursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.submission.createdAt.toISOString(), id: last.submission.id })
      : null;

  return { data, cursor };
}

/**
 * Approve / reject / merge a pending submission. Everything, including the audit entry, happens in
 * one transaction serialized on the dedup lock, so a double click or two admins can't decide the
 * same submission twice, and a failed conversion leaves the submission PENDING.
 */
export async function reviewSubmission(
  submissionId: string,
  adminId: string,
  input: ReviewSubmissionInput,
): Promise<ReviewedSubmission> {
  return db.transaction(async (tx) => {
    await acquireDedupLock(tx);

    const [submission] = await tx
      .select()
      .from(communitySubmissions)
      .where(eq(communitySubmissions.id, submissionId))
      .limit(1);
    if (!submission) {
      throw new NotFoundError('Submission not found');
    }
    if (submission.status !== 'PENDING') {
      throw new ConflictError('Submission has already been reviewed');
    }

    let resultEventId: string | null = null;
    let dedupDecision: MatchDecision | null = null;
    let dedupReason: string | null = null;
    let mergedEventId: string | null = null;

    if (input.status === 'APPROVED') {
      const result = await convertSubmission(tx, submission);
      resultEventId = result.matchedEventId;
      dedupDecision = result.decision;
      dedupReason = result.reason;
    } else if (input.status === 'MERGED') {
      const target = input.mergedEventId!;
      const [event] = await tx.select({ id: events.id }).from(events).where(eq(events.id, target)).limit(1);
      if (!event) {
        throw new NotFoundError('Event to merge into was not found');
      }
      await mergeSubmissionIntoEvent(tx, submission, target);
      mergedEventId = target;
      resultEventId = target;
    }

    const [updated] = await tx
      .update(communitySubmissions)
      .set({
        status: input.status,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes ?? null,
        mergedEventId,
      })
      .where(eq(communitySubmissions.id, submissionId))
      .returning();
    if (!updated) {
      throw new Error('Failed to update submission');
    }

    await logAdminAction(tx, {
      adminId,
      action: `submission_${input.status.toLowerCase()}`,
      targetType: 'submission',
      targetId: submissionId,
      details: {
        submitterId: submission.submitterId,
        eventTitle: submission.eventTitle,
        reviewNotes: input.reviewNotes ?? null,
        resultEventId,
        dedupDecision,
        dedupReason,
      },
    });

    return { ...toSubmissionView(updated), resultEventId, dedupDecision };
  });
}
