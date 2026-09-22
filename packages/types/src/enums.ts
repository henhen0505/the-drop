/**
 * Shared enum types, mirroring the PostgreSQL enum types defined in
 * architecture/schema.sql. Values must match the SQL enum labels exactly
 * (same casing, same strings) since Drizzle schema definitions and API
 * payloads both round-trip through these unions.
 */

export const USER_ROLES = ['USER', 'PROMOTER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CONFIDENCE_LEVELS = [
  'UNVERIFIED',
  'COMMUNITY',
  'TRUSTED_SOURCE',
  'OFFICIAL',
  'ADMIN_VERIFIED',
] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const EVENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'CANCELLED',
  'POSTPONED',
  'COMPLETED',
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const SOURCE_TYPES = [
  'TICKETMASTER',
  'SEATGEEK',
  'COMMUNITY',
  'ADMIN',
  'SPOTIFY',
  'LASTFM',
  'MUSICBRAINZ',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const USER_EVENT_STATES = [
  'DISCOVERED',
  'INTERESTED',
  'GOING',
  'HAVE_TICKET',
  'ATTENDED',
  'CANCELLED',
] as const;
export type UserEventState = (typeof USER_EVENT_STATES)[number];

export const VENDOR_CLASSIFICATIONS = ['OFFICIAL', 'VERIFIED_RESALE'] as const;
export type VendorClassification = (typeof VENDOR_CLASSIFICATIONS)[number];

export const SUBMISSION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'MERGED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'EVENT_TOMORROW',
  'EVENT_CANCELLED',
  'EVENT_RESCHEDULED',
  'ARTIST_NEW_EVENT',
  'SUBMISSION_APPROVED',
  'SUBMISSION_REJECTED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DEDUP_MATCH_STATUSES = [
  'AUTO_MERGED',
  'PENDING_REVIEW',
  'MANUAL_MERGED',
  'REJECTED',
] as const;
export type DedupMatchStatus = (typeof DEDUP_MATCH_STATUSES)[number];
