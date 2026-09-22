import type { SubmissionStatus } from '@the-drop/types';
import type { communitySubmissions } from '../../db/schema/submissions';

export type SubmissionRow = typeof communitySubmissions.$inferSelect;

/** What a submission looks like to the person who sent it (no reviewer identity). */
export interface SubmissionView {
  id: string;
  eventTitle: string;
  eventStartsAt: Date;
  venueId: string | null;
  venueNameRaw: string | null;
  venueAddressRaw: string | null;
  artistNames: string[];
  description: string | null;
  posterImageUrl: string | null;
  ticketUrl: string | null;
  sourceUrl: string | null;
  ageRestriction: string | null;
  status: SubmissionStatus;
  reviewNotes: string | null;
  reviewedAt: Date | null;
  mergedEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toSubmissionView(row: SubmissionRow): SubmissionView {
  return {
    id: row.id,
    eventTitle: row.eventTitle,
    eventStartsAt: row.eventStartsAt,
    venueId: row.venueId,
    venueNameRaw: row.venueNameRaw,
    venueAddressRaw: row.venueAddressRaw,
    artistNames: row.artistNames,
    description: row.description,
    posterImageUrl: row.posterImageUrl,
    ticketUrl: row.ticketUrl,
    sourceUrl: row.sourceUrl,
    ageRestriction: row.ageRestriction,
    status: row.status,
    reviewNotes: row.reviewNotes,
    reviewedAt: row.reviewedAt,
    mergedEventId: row.mergedEventId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
