import { eq } from 'drizzle-orm';
import { incomingEvents } from '../../db/schema/event-sources';
import { venues } from '../../db/schema/venues';
import { getDedupSettings } from '../../dedup/config';
import { extractEvent } from '../../dedup/extractors';
import { mergeIntoEvent } from '../../dedup/merger';
import { processInTransaction } from '../../dedup/processor';
import type { DbTx, DedupResult } from '../../dedup/types';
import type { SubmissionRow } from './submission-view';

/**
 * Builds the payload the dedup pipeline's community extractor reads. When the submitter picked an
 * existing venue its name and city are used, which lets the venue matcher reuse it. A free-text venue
 * has no separately-entered city, so the event is created without a venue link and an admin can
 * attach one when editing it.
 */
async function buildCommunityPayload(tx: DbTx, submission: SubmissionRow): Promise<Record<string, unknown>> {
  let venueName = submission.venueNameRaw;
  let venueCity: string | null = null;
  let venueState: string | null = null;

  if (submission.venueId) {
    const [venue] = await tx
      .select({ name: venues.name, city: venues.city, state: venues.state })
      .from(venues)
      .where(eq(venues.id, submission.venueId))
      .limit(1);
    if (venue) {
      venueName = venue.name;
      venueCity = venue.city;
      venueState = venue.state;
    }
  }

  return {
    title: submission.eventTitle,
    startsAt: submission.eventStartsAt.toISOString(),
    venueName,
    venueCity,
    venueState,
    artistNames: submission.artistNames,
    description: submission.description,
    imageUrl: submission.posterImageUrl,
    ticketUrl: submission.ticketUrl,
    sourceUrl: submission.sourceUrl,
    ageRestriction: submission.ageRestriction,
  };
}

/**
 * Turns an approved submission into an event by staging it as a COMMUNITY record and running the
 * real dedup pipeline on it, inside the caller's transaction. The submission ID is the external ID,
 * so the event_sources / event_external_ids rows link the event back to its submission, and
 * re-processing the same submission converges on the same event instead of duplicating it.
 * Depending on the dedup decision the result is a new event, a merge, or a candidate queued for review.
 */
export async function convertSubmission(tx: DbTx, submission: SubmissionRow): Promise<DedupResult> {
  const payload = await buildCommunityPayload(tx, submission);
  const [staged] = await tx
    .insert(incomingEvents)
    .values({
      sourceType: 'COMMUNITY',
      externalId: submission.id,
      rawData: payload,
      status: 'PENDING',
    })
    .returning({ id: incomingEvents.id });
  if (!staged) {
    throw new Error('Failed to stage submission');
  }

  const result = await processInTransaction(tx, staged.id, getDedupSettings());
  if (result.status !== 'PROCESSED') {
    throw new Error(`Submission ${submission.id} was not processed (${result.status})`);
  }
  return result;
}

/** Folds a submission into an event the admin chose, as an additional COMMUNITY source. */
export async function mergeSubmissionIntoEvent(
  tx: DbTx,
  submission: SubmissionRow,
  eventId: string,
): Promise<void> {
  const payload = await buildCommunityPayload(tx, submission);
  await mergeIntoEvent(
    tx,
    eventId,
    extractEvent('COMMUNITY', payload),
    { sourceType: 'COMMUNITY', externalId: submission.id, rawData: payload },
    submission.venueId,
  );
}
