import { CONFIDENCE_LEVELS } from '@the-drop/types';
import type { ConfidenceLevel, EventStatus, SourceType } from '@the-drop/types';
import type { NormalizedEvent } from './types';

/*
 * architecture/dedup-engine.md Step 6 field priority:
 * ADMIN_VERIFIED > OFFICIAL > TICKETMASTER > SEATGEEK > COMMUNITY > UNVERIFIED.
 */
const OFFICIAL_RANK = 5;
const ADMIN_RANK = 6;

const SOURCE_RANK: Partial<Record<SourceType, number>> = {
  ADMIN: ADMIN_RANK,
  TICKETMASTER: 4,
  SEATGEEK: 3,
  COMMUNITY: 2,
};

export function sourceRank(source: SourceType): number {
  return SOURCE_RANK[source] ?? 1;
}

export function confidenceForSource(source: SourceType): ConfidenceLevel {
  switch (source) {
    case 'TICKETMASTER':
    case 'SEATGEEK':
      return 'TRUSTED_SOURCE';
    case 'COMMUNITY':
      return 'COMMUNITY';
    case 'ADMIN':
      return 'ADMIN_VERIFIED';
    default:
      return 'UNVERIFIED';
  }
}

function higherConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return CONFIDENCE_LEVELS.indexOf(a) >= CONFIDENCE_LEVELS.indexOf(b) ? a : b;
}

export type FieldProvenance = Record<string, string>;

export interface ExistingEventFields {
  title: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date | null;
  venueId: string | null;
  confidence: ConfidenceLevel;
  primarySource: SourceType;
  fieldProvenance: FieldProvenance;
  status: EventStatus;
}

export interface IncomingFields extends NormalizedEvent {
  resolvedVenueId: string | null;
}

export interface EventFieldUpdates {
  title?: string;
  description?: string;
  imageUrl?: string;
  startsAt?: Date;
  endsAt?: Date;
  venueId?: string;
  confidence?: ConfidenceLevel;
  status?: EventStatus;
}

export interface FieldMergePlan {
  updates: EventFieldUpdates;
  provenance: FieldProvenance;
}

function existingRank(existing: ExistingEventFields, field: string): number {
  if (existing.confidence === 'ADMIN_VERIFIED') return ADMIN_RANK;
  const source = existing.fieldProvenance[field] ?? existing.primarySource;
  if (source === 'ADMIN') return ADMIN_RANK;
  if (existing.confidence === 'OFFICIAL') return OFFICIAL_RANK;
  return sourceRank(source as SourceType);
}

/** A source may overwrite a field it outranks, or refresh a field it already supplied. */
function outranks(
  existing: ExistingEventFields,
  field: string,
  incomingSource: SourceType,
): boolean {
  const current = existingRank(existing, field);
  const incoming = sourceRank(incomingSource);
  const sameSource = (existing.fieldProvenance[field] ?? existing.primarySource) === incomingSource;
  return incoming > current || (sameSource && incoming === current);
}

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/**
 * Times prefer TICKETMASTER (most reliable) unless an admin/official value is set;
 * other sources fall back to plain rank comparison.
 */
function mayReplaceTime(
  existing: ExistingEventFields,
  field: string,
  incomingSource: SourceType,
): boolean {
  if (incomingSource === 'TICKETMASTER') return existingRank(existing, field) < OFFICIAL_RANK;
  return outranks(existing, field, incomingSource);
}

export function planFieldMerge(
  existing: ExistingEventFields,
  incoming: IncomingFields,
  source: SourceType,
): FieldMergePlan {
  const updates: EventFieldUpdates = {};
  const provenance: FieldProvenance = { ...existing.fieldProvenance };
  const mark = (field: string): void => {
    provenance[field] = source;
  };

  if (incoming.title && incoming.title !== existing.title && outranks(existing, 'title', source)) {
    updates.title = incoming.title;
    mark('title');
  }

  if (incoming.description) {
    const current = existing.description;
    const longerAtEqualRank =
      current !== null &&
      current.length < incoming.description.length &&
      existingRank(existing, 'description') === sourceRank(source);
    if (!current || outranks(existing, 'description', source) || longerAtEqualRank) {
      if (incoming.description !== current) {
        updates.description = incoming.description;
        mark('description');
      }
    }
  }

  if (incoming.imageUrl && incoming.imageUrl !== existing.imageUrl) {
    if (!existing.imageUrl || outranks(existing, 'imageUrl', source)) {
      updates.imageUrl = incoming.imageUrl;
      mark('imageUrl');
    }
  }

  const incomingStart = new Date(incoming.startsAt);
  if (!sameInstant(incomingStart, existing.startsAt) && mayReplaceTime(existing, 'startsAt', source)) {
    updates.startsAt = incomingStart;
    mark('startsAt');
  }

  if (incoming.endsAt) {
    const incomingEnd = new Date(incoming.endsAt);
    if (!existing.endsAt) {
      updates.endsAt = incomingEnd;
      mark('endsAt');
    } else if (
      !sameInstant(incomingEnd, existing.endsAt) &&
      mayReplaceTime(existing, 'endsAt', source)
    ) {
      updates.endsAt = incomingEnd;
      mark('endsAt');
    }
  }

  if (incoming.resolvedVenueId && incoming.resolvedVenueId !== existing.venueId) {
    if (!existing.venueId || outranks(existing, 'venueId', source)) {
      updates.venueId = incoming.resolvedVenueId;
      mark('venueId');
    }
  }

  const confidence = higherConfidence(existing.confidence, confidenceForSource(source));
  if (confidence !== existing.confidence) {
    updates.confidence = confidence;
  }

  // Status changes bypass outranks()/source rank entirely: a cancellation is safety-critical, so
  // any source reporting one propagates unconditionally rather than losing to a higher-ranked
  // source's stale PUBLISHED status. Only TICKETMASTER's extractor sets NormalizedEvent.status
  // today, so this is not yet exploitable by a lower-trust source.
  if (incoming.status && incoming.status !== existing.status) {
    updates.status = incoming.status;
    mark('status');
  }

  return { updates, provenance };
}
